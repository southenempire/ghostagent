//! GhostVault: a spending vault for an AI agent where every spend must be an *attested intent*.
//!
//! The agent holds only a function-call key for `execute_attested`. That key alone cannot move funds:
//! each call must carry a NEAR AI Cloud completion together with the TEE signature over it.
//! The contract checks, on-chain:
//!   1. the signature recovers to a signer address the owner approved (verified off-chain against the
//!      NEAR AI attestation report),
//!   2. the signed text commits to sha256(response body), so the plan cannot be edited after signing,
//!   3. the plan inside the response targets this vault, is fresh, has not been used before,
//!   4. the plan stays within the owner's policy: daily caps, approved payees, killswitch.
//! The prompt itself never reaches the chain; only its hash (inside the signed text) does.
//!
//! Two kinds of spend:
//!   - "pay": NEAR transfer to an approved NEAR account.
//!   - "evm_transfer": ETH transfer from the vault's own EVM address (NEAR Chain Signatures, path
//!     `ghost/evm`). The contract builds the EIP-1559 transaction itself from the attested plan, so the
//!     MPC network only ever signs exactly what the TEE decided.

mod evm;

use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{self, Value};
use near_sdk::store::{IterableSet, LookupSet, Vector};
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PublicKey};

/// 24 hours in nanoseconds
const ONE_DAY_NS: u64 = 86_400_000_000_000;
/// An AI decision older than this cannot be executed
const MAX_DECISION_AGE_S: u64 = 600;
const GAS_FOR_MPC_SIGN: Gas = Gas::from_tgas(50);
const STORAGE_RESERVE: NearToken = NearToken::from_millinear(500);
/// MPC derivation path of the vault's EVM address
pub const EVM_PATH: &str = "ghost/evm";
const SEPOLIA_CHAIN_ID: u64 = 11_155_111;

/// Evidence produced by NEAR AI Cloud for one chat completion.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct Attestation {
    /// Exact bytes of the completion response body, as returned by NEAR AI Cloud
    pub response_body: String,
    /// `text` from GET /v1/signature/{chat_id}: "<model>:<request_sha256>:<response_sha256>"
    /// (provider_tee) or "<request_sha256>:<response_sha256>" (gateway)
    pub signed_text: String,
    /// 65-byte ECDSA signature (EIP-191 personal_sign), hex with or without 0x
    pub signature: String,
}

/// The decision the AI returns, embedded as JSON in the completion's message content.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct Plan {
    /// "pay" (NEAR transfer), "evm_transfer" (ETH via chain signatures) or "refuse"
    pub action: String,
    pub vault: AccountId,
    #[serde(default)]
    pub amount_near: String,
    #[serde(default)]
    pub payee: Option<AccountId>,
    /// evm_transfer: 0x recipient
    #[serde(default)]
    pub to: Option<String>,
    /// evm_transfer: decimal ETH amount
    #[serde(default)]
    pub amount_eth: Option<String>,
    #[serde(default)]
    pub reason: String,
}

/// Network parameters of the EVM transaction. Everything that moves value (to, amount) comes from the
/// attested plan instead; the agent only supplies what it reads from the EVM chain.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct EvmTxParams {
    pub nonce: u64,
    pub max_fee_per_gas: U128,
    pub max_priority_fee_per_gas: U128,
}

#[derive(Clone, Debug)]
#[near(serializers = [borsh, json])]
pub struct ExecutionRecord {
    pub nonce: u64,
    pub action: String,
    pub amount: NearToken,
    pub payee: Option<AccountId>,
    pub chain: Option<String>,
    pub derivation_path: Option<String>,
    pub reason: String,
    pub request_hash: String,
    pub response_hash: String,
    pub ai_signer: String,
    pub block_timestamp_ns: u64,
    pub evm_to: Option<String>,
    pub evm_value_wei: Option<U128>,
    pub evm_chain_id: Option<u64>,
    pub evm_nonce: Option<u64>,
    /// keccak256 of the unsigned EIP-1559 transaction sent to the MPC signer
    pub evm_tx_hash_to_sign: Option<String>,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct VaultStateView {
    pub owner_id: AccountId,
    pub agent_pk: PublicKey,
    pub vault_balance: NearToken,
    pub daily_budget_cap: NearToken,
    pub daily_spent_today: NearToken,
    pub remaining_allowance_today: NearToken,
    pub is_frozen: bool,
    pub execution_count: u64,
    pub mpc_signer_contract: AccountId,
    pub attested_signers: Vec<String>,
    pub approved_payees: Vec<AccountId>,
    pub evm_chain_id: u64,
    pub evm_path: String,
    pub evm_daily_cap_wei: U128,
    pub evm_spent_today_wei: U128,
    pub evm_max_fee_per_gas: U128,
    pub evm_payees: Vec<String>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct GhostVault {
    /// The human (or multisig) that funds the vault and sets policy
    pub owner_id: AccountId,
    /// The function-call key the agent signs with
    pub agent_pk: PublicKey,
    pub daily_budget_cap: NearToken,
    pub daily_spent: NearToken,
    pub last_window_start_ns: u64,
    pub is_frozen: bool,
    pub execution_nonce: u64,
    pub mpc_signer_contract: AccountId,
    /// Lowercase 0x addresses of NEAR AI TEE signers the owner approved
    pub attested_signers: IterableSet<String>,
    /// NEAR accounts the agent may pay with the "pay" action
    pub approved_payees: IterableSet<AccountId>,
    /// sha256 of every response already executed (replay protection)
    pub used_responses: LookupSet<String>,
    pub executions: Vector<ExecutionRecord>,
    pub evm_chain_id: u64,
    pub evm_daily_cap_wei: u128,
    pub evm_spent_wei: u128,
    /// Upper bound on max_fee_per_gas, so the agent cannot burn the EVM balance on fees
    pub evm_max_fee_per_gas: u128,
    /// Lowercase 0x addresses the agent may send ETH to
    pub evm_payees: IterableSet<String>,
}

#[near]
impl GhostVault {
    #[init]
    pub fn new(
        owner_id: AccountId,
        agent_pk: PublicKey,
        daily_budget_cap: NearToken,
        attested_signers: Vec<String>,
        approved_payees: Vec<AccountId>,
        mpc_signer_contract: Option<AccountId>,
    ) -> Self {
        let mut vault = Self {
            owner_id,
            agent_pk,
            daily_budget_cap,
            daily_spent: NearToken::from_yoctonear(0),
            last_window_start_ns: env::block_timestamp(),
            is_frozen: false,
            execution_nonce: 0,
            mpc_signer_contract: mpc_signer_contract
                .unwrap_or_else(|| "v1.signer-prod.testnet".parse().unwrap()),
            attested_signers: IterableSet::new(b"s"),
            approved_payees: IterableSet::new(b"p"),
            used_responses: LookupSet::new(b"u"),
            executions: Vector::new(b"x"),
            evm_chain_id: SEPOLIA_CHAIN_ID,
            evm_daily_cap_wei: 0,
            evm_spent_wei: 0,
            evm_max_fee_per_gas: 100_000_000_000, // 100 gwei
            evm_payees: IterableSet::new(b"v"),
        };
        for s in attested_signers {
            vault.attested_signers.insert(normalize_address(&s));
        }
        for p in approved_payees {
            vault.approved_payees.insert(p);
        }
        vault
    }

    /// v0.2 → v0.3: adds the EVM policy and moves execution records to the new layout.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let mut old: migration::GhostVaultV2 =
            env::state_read().unwrap_or_else(|| env::panic_str("No v0.2 state to migrate"));
        let mut executions = Vector::new(b"x");
        for r in old.executions.iter() {
            executions.push(r.clone().into());
        }
        old.executions.clear();
        old.executions.flush();
        Self {
            owner_id: old.owner_id,
            agent_pk: old.agent_pk,
            daily_budget_cap: old.daily_budget_cap,
            daily_spent: old.daily_spent,
            last_window_start_ns: old.last_window_start_ns,
            is_frozen: old.is_frozen,
            execution_nonce: old.execution_nonce,
            mpc_signer_contract: old.mpc_signer_contract,
            attested_signers: old.attested_signers,
            approved_payees: old.approved_payees,
            used_responses: old.used_responses,
            executions,
            evm_chain_id: SEPOLIA_CHAIN_ID,
            evm_daily_cap_wei: 0,
            evm_spent_wei: 0,
            evm_max_fee_per_gas: 100_000_000_000,
            evm_payees: IterableSet::new(b"v"),
        }
    }

    #[payable]
    pub fn deposit(&mut self) -> NearToken {
        let amount = env::attached_deposit();
        require!(amount > NearToken::from_yoctonear(0), "Attached deposit must be greater than 0");
        log_event("vault_deposit", &format!("{{\"from\":\"{}\",\"amount\":\"{}\"}}", env::predecessor_account_id(), amount.as_yoctonear()));
        env::account_balance()
    }

    /// The only method the agent key can call. Everything the agent may do comes from the attested plan;
    /// `evm_tx` (nonce and fees read from the EVM chain) is needed only for "evm_transfer".
    pub fn execute_attested(&mut self, attestation: Attestation, evm_tx: Option<EvmTxParams>) -> Promise {
        require!(!self.is_frozen, "FROZEN: vault is frozen by the owner's killswitch");
        require!(
            env::signer_account_pk() == self.agent_pk || env::predecessor_account_id() == self.owner_id,
            "UNAUTHORIZED: caller is not the agent key or the owner"
        );

        // 1. Signature recovers to an approved TEE signer
        let ai_signer = recover_eip191_signer(&attestation.signed_text, &attestation.signature);
        require!(
            self.attested_signers.contains(&ai_signer),
            format!("UNATTESTED: signer {} is not an approved NEAR AI TEE signer", ai_signer)
        );

        // 2. Signed text commits to exactly this response body
        let (request_hash, response_hash) = parse_signed_text(&attestation.signed_text);
        require!(
            hex_encode(&env::sha256(attestation.response_body.as_bytes())) == response_hash,
            "TAMPERED: response body does not match the signed response hash"
        );
        require!(!self.used_responses.contains(&response_hash), "REPLAY: this AI decision was already executed");

        // 3. Decision is fresh and meant for this vault
        let (plan, created_s) = parse_plan(&attestation.response_body);
        let now_s = env::block_timestamp() / 1_000_000_000;
        require!(created_s + MAX_DECISION_AGE_S >= now_s, "STALE: AI decision is older than 10 minutes");
        require!(plan.vault == env::current_account_id(), "WRONG_VAULT: plan targets a different vault");
        require!(plan.action != "refuse", format!("REFUSED: the AI declined: {}", plan.reason));

        self.roll_window();
        self.execution_nonce += 1;
        self.used_responses.insert(response_hash.clone());

        let mut record = ExecutionRecord {
            nonce: self.execution_nonce,
            action: plan.action.clone(),
            amount: NearToken::from_yoctonear(0),
            payee: None,
            chain: None,
            derivation_path: None,
            reason: plan.reason.clone(),
            request_hash,
            response_hash,
            ai_signer,
            block_timestamp_ns: env::block_timestamp(),
            evm_to: None,
            evm_value_wei: None,
            evm_chain_id: None,
            evm_nonce: None,
            evm_tx_hash_to_sign: None,
        };

        // 4. Policy, per action
        let promise = match plan.action.as_str() {
            "pay" => {
                let amount = parse_decimal(&plan.amount_near, 24, "amount_near");
                let amount = NearToken::from_yoctonear(amount);
                require!(amount > NearToken::from_yoctonear(0), "POLICY: amount must be positive");
                let new_spent = self.daily_spent.saturating_add(amount);
                require!(
                    new_spent <= self.daily_budget_cap,
                    format!(
                        "POLICY: spend of {} would exceed the daily cap of {} (already spent {})",
                        amount.exact_amount_display(),
                        self.daily_budget_cap.exact_amount_display(),
                        self.daily_spent.exact_amount_display()
                    )
                );
                let payee = plan.payee.clone().unwrap_or_else(|| env::panic_str("POLICY: pay plan has no payee"));
                require!(
                    self.approved_payees.contains(&payee),
                    format!("POLICY: payee {} is not on the owner's approved list", payee)
                );
                require!(
                    env::account_balance() >= amount.saturating_add(STORAGE_RESERVE),
                    "POLICY: vault balance too low"
                );
                self.daily_spent = new_spent;
                record.amount = amount;
                record.payee = Some(payee.clone());
                Promise::new(payee).transfer(amount)
            }
            "evm_transfer" => {
                let to = normalize_address(plan.to.as_deref().unwrap_or_else(|| env::panic_str("POLICY: evm_transfer plan has no 'to'")));
                require!(
                    self.evm_payees.contains(&to),
                    format!("POLICY: EVM recipient {} is not on the owner's approved list", to)
                );
                let value = parse_decimal(plan.amount_eth.as_deref().unwrap_or(""), 18, "amount_eth");
                require!(value > 0, "POLICY: amount_eth must be positive");
                let new_spent = self.evm_spent_wei.saturating_add(value);
                require!(
                    new_spent <= self.evm_daily_cap_wei,
                    format!(
                        "POLICY: {} wei would exceed the EVM daily cap of {} wei (already spent {})",
                        value, self.evm_daily_cap_wei, self.evm_spent_wei
                    )
                );
                let params = evm_tx.unwrap_or_else(|| env::panic_str("evm_transfer needs evm_tx (nonce and fees)"));
                require!(
                    params.max_fee_per_gas.0 <= self.evm_max_fee_per_gas
                        && params.max_priority_fee_per_gas.0 <= params.max_fee_per_gas.0,
                    "POLICY: EVM fees above the owner's max_fee_per_gas"
                );
                let tx = evm::Eip1559Transfer {
                    chain_id: self.evm_chain_id,
                    nonce: params.nonce,
                    max_priority_fee_per_gas: params.max_priority_fee_per_gas.0,
                    max_fee_per_gas: params.max_fee_per_gas.0,
                    to: hex_decode(&to[2..]).unwrap(),
                    value,
                };
                let hash = tx.signing_hash();
                self.evm_spent_wei = new_spent;
                record.chain = Some(format!("eip155:{}", self.evm_chain_id));
                record.derivation_path = Some(EVM_PATH.to_string());
                record.evm_to = Some(to);
                record.evm_value_wei = Some(U128(value));
                record.evm_chain_id = Some(self.evm_chain_id);
                record.evm_nonce = Some(params.nonce);
                record.evm_tx_hash_to_sign = Some(hex_encode(&hash));
                let args = serde_json::json!({
                    "request": { "payload_v2": { "Ecdsa": hex_encode(&hash) }, "path": EVM_PATH, "domain_id": 0 }
                });
                Promise::new(self.mpc_signer_contract.clone()).function_call(
                    "sign".to_string(),
                    args.to_string().into_bytes(),
                    NearToken::from_yoctonear(1),
                    GAS_FOR_MPC_SIGN,
                )
            }
            other => env::panic_str(&format!("POLICY: unknown action '{}'", other)),
        };

        log_event("attested_intent_executed", &serde_json::to_string(&record).unwrap());
        self.executions.push(record);
        promise
    }

    /* ----------------------------- owner controls ----------------------------- */

    /// Killswitch: blocks every agent call until `rearm_agent`
    pub fn emergency_revoke_and_freeze(&mut self) {
        self.assert_owner();
        self.is_frozen = true;
        log_event("killswitch_activated", &format!("{{\"owner\":\"{}\"}}", self.owner_id));
    }

    pub fn rearm_agent(&mut self, new_agent_pk: Option<PublicKey>) {
        self.assert_owner();
        if let Some(pk) = new_agent_pk {
            self.agent_pk = pk;
        }
        self.is_frozen = false;
        log_event("agent_rearmed", "{}");
    }

    /// Hand the vault to another account, e.g. the owner's own wallet or a multisig
    pub fn set_owner(&mut self, new_owner: AccountId) {
        self.assert_owner();
        log_event("owner_changed", &format!("{{\"from\":\"{}\",\"to\":\"{}\"}}", self.owner_id, new_owner));
        self.owner_id = new_owner;
    }

    pub fn set_daily_cap(&mut self, daily_budget_cap: NearToken) {
        self.assert_owner();
        self.daily_budget_cap = daily_budget_cap;
    }

    pub fn set_evm_policy(&mut self, daily_cap_wei: U128, max_fee_per_gas: Option<U128>) {
        self.assert_owner();
        self.evm_daily_cap_wei = daily_cap_wei.0;
        if let Some(fee) = max_fee_per_gas {
            self.evm_max_fee_per_gas = fee.0;
        }
    }

    pub fn add_attested_signer(&mut self, address: String) {
        self.assert_owner();
        self.attested_signers.insert(normalize_address(&address));
    }

    pub fn remove_attested_signer(&mut self, address: String) {
        self.assert_owner();
        self.attested_signers.remove(&normalize_address(&address));
    }

    pub fn add_payee(&mut self, payee: AccountId) {
        self.assert_owner();
        self.approved_payees.insert(payee);
    }

    pub fn remove_payee(&mut self, payee: AccountId) {
        self.assert_owner();
        self.approved_payees.remove(&payee);
    }

    pub fn add_evm_payee(&mut self, address: String) {
        self.assert_owner();
        self.evm_payees.insert(normalize_address(&address));
    }

    pub fn remove_evm_payee(&mut self, address: String) {
        self.assert_owner();
        self.evm_payees.remove(&normalize_address(&address));
    }

    pub fn withdraw_all(&mut self, recipient: Option<AccountId>) -> Promise {
        self.assert_owner();
        let target = recipient.unwrap_or_else(|| self.owner_id.clone());
        let balance = env::account_balance();
        require!(balance > STORAGE_RESERVE, "Insufficient vault balance to withdraw");
        let amount = balance.saturating_sub(STORAGE_RESERVE);
        log_event("vault_withdrawn", &format!("{{\"recipient\":\"{}\",\"amount\":\"{}\"}}", target, amount.as_yoctonear()));
        Promise::new(target).transfer(amount)
    }

    /* --------------------------------- views ---------------------------------- */

    pub fn get_vault_state(&self) -> VaultStateView {
        let window_expired = env::block_timestamp().saturating_sub(self.last_window_start_ns) >= ONE_DAY_NS;
        let spent = if window_expired { NearToken::from_yoctonear(0) } else { self.daily_spent };
        let evm_spent = if window_expired { 0 } else { self.evm_spent_wei };
        VaultStateView {
            owner_id: self.owner_id.clone(),
            agent_pk: self.agent_pk.clone(),
            vault_balance: env::account_balance(),
            daily_budget_cap: self.daily_budget_cap,
            daily_spent_today: spent,
            remaining_allowance_today: self.daily_budget_cap.saturating_sub(spent),
            is_frozen: self.is_frozen,
            execution_count: self.execution_nonce,
            mpc_signer_contract: self.mpc_signer_contract.clone(),
            attested_signers: self.attested_signers.iter().cloned().collect(),
            approved_payees: self.approved_payees.iter().cloned().collect(),
            evm_chain_id: self.evm_chain_id,
            evm_path: EVM_PATH.to_string(),
            evm_daily_cap_wei: U128(self.evm_daily_cap_wei),
            evm_spent_today_wei: U128(evm_spent),
            evm_max_fee_per_gas: U128(self.evm_max_fee_per_gas),
            evm_payees: self.evm_payees.iter().cloned().collect(),
        }
    }

    /// Newest first
    pub fn get_executions(&self, limit: Option<u32>) -> Vec<ExecutionRecord> {
        let limit = limit.unwrap_or(20).min(100);
        let len = self.executions.len();
        (0..len.min(limit)).map(|i| self.executions[len - 1 - i].clone()).collect()
    }

    /// Lets the agent check a decision before spending gas on it. Panics with the same message
    /// `execute_attested` would for signature and tampering problems.
    pub fn verify_attestation(&self, attestation: Attestation) -> Plan {
        let ai_signer = recover_eip191_signer(&attestation.signed_text, &attestation.signature);
        require!(self.attested_signers.contains(&ai_signer), format!("UNATTESTED: signer {}", ai_signer));
        let (_, response_hash) = parse_signed_text(&attestation.signed_text);
        require!(
            hex_encode(&env::sha256(attestation.response_body.as_bytes())) == response_hash,
            "TAMPERED: response body does not match the signed response hash"
        );
        parse_plan(&attestation.response_body).0
    }

    /// The hash the vault would ask the MPC network to sign, for the agent to rebuild the signed tx.
    pub fn preview_evm_transfer(&self, to: String, value_wei: U128, evm_tx: EvmTxParams) -> String {
        let to = normalize_address(&to);
        let tx = evm::Eip1559Transfer {
            chain_id: self.evm_chain_id,
            nonce: evm_tx.nonce,
            max_priority_fee_per_gas: evm_tx.max_priority_fee_per_gas.0,
            max_fee_per_gas: evm_tx.max_fee_per_gas.0,
            to: hex_decode(&to[2..]).unwrap(),
            value: value_wei.0,
        };
        hex_encode(&tx.signing_hash())
    }

    /* -------------------------------- internal -------------------------------- */

    fn roll_window(&mut self) {
        let now = env::block_timestamp();
        if now.saturating_sub(self.last_window_start_ns) >= ONE_DAY_NS {
            self.daily_spent = NearToken::from_yoctonear(0);
            self.evm_spent_wei = 0;
            self.last_window_start_ns = now;
        }
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner_id, "UNAUTHORIZED: only the vault owner can call this");
    }
}

/* ------------------------------ migration ----------------------------------- */

mod migration {
    use super::*;

    /// Execution record layout of v0.2
    #[derive(Clone)]
    #[near(serializers = [borsh])]
    pub struct ExecutionRecordV2 {
        pub nonce: u64,
        pub action: String,
        pub amount: NearToken,
        pub payee: Option<AccountId>,
        pub chain: Option<String>,
        pub derivation_path: Option<String>,
        pub reason: String,
        pub request_hash: String,
        pub response_hash: String,
        pub ai_signer: String,
        pub block_timestamp_ns: u64,
    }

    impl From<ExecutionRecordV2> for ExecutionRecord {
        fn from(r: ExecutionRecordV2) -> Self {
            Self {
                nonce: r.nonce,
                action: r.action,
                amount: r.amount,
                payee: r.payee,
                chain: r.chain,
                derivation_path: r.derivation_path,
                reason: r.reason,
                request_hash: r.request_hash,
                response_hash: r.response_hash,
                ai_signer: r.ai_signer,
                block_timestamp_ns: r.block_timestamp_ns,
                evm_to: None,
                evm_value_wei: None,
                evm_chain_id: None,
                evm_nonce: None,
                evm_tx_hash_to_sign: None,
            }
        }
    }

    /// Contract state layout of v0.2
    #[near(serializers = [borsh])]
    pub struct GhostVaultV2 {
        pub owner_id: AccountId,
        pub agent_pk: PublicKey,
        pub daily_budget_cap: NearToken,
        pub daily_spent: NearToken,
        pub last_window_start_ns: u64,
        pub is_frozen: bool,
        pub execution_nonce: u64,
        pub mpc_signer_contract: AccountId,
        pub attested_signers: IterableSet<String>,
        pub approved_payees: IterableSet<AccountId>,
        pub used_responses: LookupSet<String>,
        pub executions: Vector<ExecutionRecordV2>,
    }
}

/* ------------------------------- helpers ------------------------------------ */

fn log_event(event: &str, data: &str) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"ghostvault\",\"version\":\"3.0.0\",\"event\":\"{}\",\"data\":[{}]}}",
        event, data
    ));
}

fn strip_0x(s: &str) -> &str {
    s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")).unwrap_or(s)
}

fn normalize_address(addr: &str) -> String {
    let a = strip_0x(addr.trim()).to_lowercase();
    require!(a.len() == 40 && hex_decode(&a).is_some(), "Address must be a 20-byte hex address");
    format!("0x{}", a)
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect()
}

/// EIP-191 personal_sign recovery: keccak256("\x19Ethereum Signed Message:\n" + len + text)
fn recover_eip191_signer(text: &str, signature_hex: &str) -> String {
    let sig = hex_decode(strip_0x(signature_hex.trim())).unwrap_or_else(|| env::panic_str("BAD_SIGNATURE: not hex"));
    require!(sig.len() == 65, "BAD_SIGNATURE: expected 65 bytes");
    let v = if sig[64] >= 27 { sig[64] - 27 } else { sig[64] };
    require!(v <= 1, "BAD_SIGNATURE: invalid recovery id");

    let mut msg = format!("\x19Ethereum Signed Message:\n{}", text.len()).into_bytes();
    msg.extend_from_slice(text.as_bytes());
    let hash = env::keccak256(&msg);

    let pubkey = env::ecrecover(&hash, &sig[..64], v, true)
        .unwrap_or_else(|| env::panic_str("BAD_SIGNATURE: recovery failed"));
    format!("0x{}", hex_encode(&env::keccak256(&pubkey)[12..]))
}

/// Returns (request_hash, response_hash). The model id may itself contain ':'.
fn parse_signed_text(text: &str) -> (String, String) {
    let mut parts = text.rsplitn(3, ':');
    let response = parts.next().unwrap_or_default().to_lowercase();
    let request = parts.next().unwrap_or_default().to_lowercase();
    require!(
        response.len() == 64 && request.len() == 64 && hex_decode(&response).is_some() && hex_decode(&request).is_some(),
        "BAD_SIGNED_TEXT: expected [model:]request_sha256:response_sha256"
    );
    (request, response)
}

/// Pulls the plan JSON out of choices[0].message.content and the completion's `created` time.
fn parse_plan(response_body: &str) -> (Plan, u64) {
    let body: Value = serde_json::from_str(response_body).unwrap_or_else(|_| env::panic_str("BAD_RESPONSE: not JSON"));
    let created = body["created"].as_u64().unwrap_or_else(|| env::panic_str("BAD_RESPONSE: missing created"));
    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_else(|| env::panic_str("BAD_RESPONSE: missing message content"));
    let start = content.find('{').unwrap_or_else(|| env::panic_str("BAD_PLAN: no JSON object in AI output"));
    let end = content.rfind('}').unwrap_or_else(|| env::panic_str("BAD_PLAN: no JSON object in AI output"));
    require!(end > start, "BAD_PLAN: no JSON object in AI output");
    let plan: Plan = serde_json::from_str(&content[start..=end])
        .unwrap_or_else(|e| env::panic_str(&format!("BAD_PLAN: {}", e)));
    (plan, created)
}

/// "1.25" with `decimals` = 24 → 1.25 × 10^24. No exponent, no sign.
fn parse_decimal(s: &str, decimals: usize, field: &str) -> u128 {
    let s = s.trim();
    let (whole, frac) = s.split_once('.').unwrap_or((s, ""));
    require!(
        !whole.is_empty() && whole.chars().all(|c| c.is_ascii_digit())
            && frac.len() <= decimals && frac.chars().all(|c| c.is_ascii_digit()),
        format!("BAD_PLAN: invalid {} '{}'", field, s)
    );
    let whole: u128 = whole.parse().unwrap_or_else(|_| env::panic_str("BAD_PLAN: amount too large"));
    let frac_units: u128 = if frac.is_empty() { 0 } else { format!("{:0<width$}", frac, width = decimals).parse().unwrap() };
    whole
        .checked_mul(10u128.pow(decimals as u32))
        .and_then(|w| w.checked_add(frac_units))
        .unwrap_or_else(|| env::panic_str("BAD_PLAN: amount too large"))
}

/* --------------------------------- tests ------------------------------------ */

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;
    use secp256k1::{Message, Secp256k1, SecretKey};

    const NOW_S: u64 = 1_800_000_000;
    const AGENT_PK: &str = "ed25519:6E8sCci9badyRkXb3JoRpAx5bMrqjz8NTCbPoN8q8b59";
    const OTHER_PK: &str = "ed25519:GkUi9HxyAFKmfuXeYJjZ5FNzA9Kki6jkHsWnbWvCuYMG";
    const EVM_TO: &str = "0x000000000000000000000000000000000000dead";

    fn tee_key() -> SecretKey {
        SecretKey::from_slice(&[7u8; 32]).unwrap()
    }

    fn address_of(sk: &SecretKey) -> String {
        let pk = sk.public_key(&Secp256k1::new()).serialize_uncompressed();
        format!("0x{}", hex_encode(&env::keccak256(&pk[1..])[12..]))
    }

    fn sign_eip191(sk: &SecretKey, text: &str) -> String {
        let mut msg = format!("\x19Ethereum Signed Message:\n{}", text.len()).into_bytes();
        msg.extend_from_slice(text.as_bytes());
        let hash = env::keccak256(&msg);
        let (rec, sig) = Secp256k1::new()
            .sign_ecdsa_recoverable(&Message::from_slice(&hash).unwrap(), sk)
            .serialize_compact();
        format!("0x{}{:02x}", hex_encode(&sig), rec.to_i32() as u8 + 27)
    }

    fn response(plan: &str, created: u64) -> String {
        serde_json::json!({
            "id": "chatcmpl-test",
            "created": created,
            "model": "test-model",
            "choices": [{ "index": 0, "message": { "role": "assistant", "content": plan } }]
        })
        .to_string()
    }

    fn attest(sk: &SecretKey, body: &str) -> Attestation {
        let text = format!(
            "test-model:{}:{}",
            hex_encode(&env::sha256(b"private prompt")),
            hex_encode(&env::sha256(body.as_bytes()))
        );
        Attestation { response_body: body.to_string(), signature: sign_eip191(sk, &text), signed_text: text }
    }

    fn pay_plan(amount: &str, payee: &str) -> String {
        format!(
            "Decision:\n```json\n{{\"action\":\"pay\",\"vault\":\"{}\",\"amount_near\":\"{}\",\"payee\":\"{}\",\"reason\":\"buy data\"}}\n```",
            accounts(0), amount, payee
        )
    }

    fn evm_plan(amount_eth: &str, to: &str) -> String {
        format!(
            "{{\"action\":\"evm_transfer\",\"vault\":\"{}\",\"to\":\"{}\",\"amount_eth\":\"{}\",\"reason\":\"pay supplier\"}}",
            accounts(0), to, amount_eth
        )
    }

    fn evm_params(max_fee: u128) -> Option<EvmTxParams> {
        Some(EvmTxParams { nonce: 3, max_fee_per_gas: U128(max_fee), max_priority_fee_per_gas: U128(1_000_000_000) })
    }

    fn context(signer_pk: &str, predecessor: AccountId) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id(accounts(0))
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor)
            .signer_account_pk(signer_pk.parse().unwrap())
            .account_balance(NearToken::from_near(10))
            .block_timestamp(NOW_S * 1_000_000_000);
        b
    }

    fn setup() -> GhostVault {
        testing_env!(context(OTHER_PK, accounts(1)).build());
        let mut vault = GhostVault::new(
            accounts(1),
            AGENT_PK.parse().unwrap(),
            NearToken::from_near(5),
            vec![address_of(&tee_key())],
            vec![accounts(2)],
            None,
        );
        vault.add_evm_payee(EVM_TO.to_string());
        vault.set_evm_policy(U128(10u128.pow(16)), None); // 0.01 ETH per day
        testing_env!(context(AGENT_PK, accounts(0)).build());
        vault
    }

    #[test]
    fn pays_approved_payee_with_valid_attestation() {
        let mut vault = setup();
        let att = attest(&tee_key(), &response(&pay_plan("1.5", accounts(2).as_str()), NOW_S - 30));
        let _ = vault.execute_attested(att, None);

        let state = vault.get_vault_state();
        assert_eq!(state.daily_spent_today, NearToken::from_millinear(1500));
        assert_eq!(state.execution_count, 1);
        let rec = &vault.get_executions(None)[0];
        assert_eq!(rec.payee, Some(accounts(2)));
        assert_eq!(rec.ai_signer, address_of(&tee_key()));
        assert_eq!(rec.request_hash, hex_encode(&env::sha256(b"private prompt")));
    }

    #[test]
    #[should_panic(expected = "UNATTESTED")]
    fn rejects_decision_signed_outside_the_tee() {
        let mut vault = setup();
        let forger = SecretKey::from_slice(&[9u8; 32]).unwrap();
        let att = attest(&forger, &response(&pay_plan("1", accounts(2).as_str()), NOW_S));
        let _ = vault.execute_attested(att, None);
    }

    #[test]
    #[should_panic(expected = "TAMPERED")]
    fn rejects_edited_plan() {
        let mut vault = setup();
        let mut att = attest(&tee_key(), &response(&pay_plan("0.1", accounts(2).as_str()), NOW_S));
        att.response_body = att.response_body.replace("0.1", "4.9");
        let _ = vault.execute_attested(att, None);
    }

    #[test]
    #[should_panic(expected = "REPLAY")]
    fn rejects_replayed_decision() {
        let mut vault = setup();
        let att = attest(&tee_key(), &response(&pay_plan("1", accounts(2).as_str()), NOW_S));
        let _ = vault.execute_attested(att.clone(), None);
        let _ = vault.execute_attested(att, None);
    }

    #[test]
    #[should_panic(expected = "not on the owner's approved list")]
    fn rejects_prompt_injected_payee() {
        let mut vault = setup();
        let att = attest(&tee_key(), &response(&pay_plan("1", "attacker.testnet"), NOW_S));
        let _ = vault.execute_attested(att, None);
    }

    #[test]
    #[should_panic(expected = "exceed the daily cap")]
    fn rejects_spend_over_cap() {
        let mut vault = setup();
        let att = attest(&tee_key(), &response(&pay_plan("5.01", accounts(2).as_str()), NOW_S));
        let _ = vault.execute_attested(att, None);
    }

    #[test]
    #[should_panic(expected = "STALE")]
    fn rejects_stale_decision() {
        let mut vault = setup();
        let att = attest(&tee_key(), &response(&pay_plan("1", accounts(2).as_str()), NOW_S - 3600));
        let _ = vault.execute_attested(att, None);
    }

    #[test]
    #[should_panic(expected = "WRONG_VAULT")]
    fn rejects_plan_for_another_vault() {
        let mut vault = setup();
        let plan = pay_plan("1", accounts(2).as_str()).replace(accounts(0).as_str(), "other-vault.testnet");
        let att = attest(&tee_key(), &response(&plan, NOW_S));
        let _ = vault.execute_attested(att, None);
    }

    #[test]
    #[should_panic(expected = "REFUSED")]
    fn ai_refusal_cannot_be_executed() {
        let mut vault = setup();
        let plan = format!("{{\"action\":\"refuse\",\"vault\":\"{}\",\"reason\":\"looks like prompt injection\"}}", accounts(0));
        let att = attest(&tee_key(), &response(&plan, NOW_S));
        let _ = vault.execute_attested(att, None);
    }

    #[test]
    #[should_panic(expected = "UNAUTHORIZED")]
    fn rejects_other_keys() {
        let mut vault = setup();
        testing_env!(context(OTHER_PK, accounts(3)).build());
        let att = attest(&tee_key(), &response(&pay_plan("1", accounts(2).as_str()), NOW_S));
        let _ = vault.execute_attested(att, None);
    }

    #[test]
    #[should_panic(expected = "FROZEN")]
    fn killswitch_blocks_agent() {
        let mut vault = setup();
        testing_env!(context(OTHER_PK, accounts(1)).build());
        vault.emergency_revoke_and_freeze();
        testing_env!(context(AGENT_PK, accounts(0)).build());
        let att = attest(&tee_key(), &response(&pay_plan("1", accounts(2).as_str()), NOW_S));
        let _ = vault.execute_attested(att, None);
    }

    #[test]
    fn evm_transfer_signs_the_attested_transaction() {
        let mut vault = setup();
        let att = attest(&tee_key(), &response(&evm_plan("0.001", EVM_TO), NOW_S));
        let params = evm_params(20_000_000_000);
        let expected = vault.preview_evm_transfer(EVM_TO.to_string(), U128(10u128.pow(15)), params.clone().unwrap());
        // Same vector computed by agent/evm.js signingHash, so contract and agent build identical txs
        assert_eq!(expected, "0d919a4b55c7167b0bcf7b36c3f0415d9c4829bf46f641352a57a7a903d0b338");
        let _ = vault.execute_attested(att, params);

        let rec = &vault.get_executions(None)[0];
        assert_eq!(rec.evm_to.as_deref(), Some(EVM_TO));
        assert_eq!(rec.evm_value_wei, Some(U128(10u128.pow(15))));
        assert_eq!(rec.derivation_path.as_deref(), Some(EVM_PATH));
        assert_eq!(rec.evm_tx_hash_to_sign.as_deref(), Some(expected.as_str()));
        assert_eq!(vault.get_vault_state().evm_spent_today_wei, U128(10u128.pow(15)));
    }

    #[test]
    #[should_panic(expected = "EVM recipient")]
    fn evm_rejects_unapproved_recipient() {
        let mut vault = setup();
        let att = attest(&tee_key(), &response(&evm_plan("0.001", "0x1111111111111111111111111111111111111111"), NOW_S));
        let _ = vault.execute_attested(att, evm_params(20_000_000_000));
    }

    #[test]
    #[should_panic(expected = "EVM daily cap")]
    fn evm_rejects_over_cap() {
        let mut vault = setup();
        let att = attest(&tee_key(), &response(&evm_plan("0.02", EVM_TO), NOW_S));
        let _ = vault.execute_attested(att, evm_params(20_000_000_000));
    }

    #[test]
    #[should_panic(expected = "max_fee_per_gas")]
    fn evm_rejects_fee_burn() {
        let mut vault = setup();
        let att = attest(&tee_key(), &response(&evm_plan("0.001", EVM_TO), NOW_S));
        let _ = vault.execute_attested(att, evm_params(5_000_000_000_000));
    }

    #[test]
    fn owner_can_hand_vault_to_wallet() {
        let mut vault = setup();
        testing_env!(context(OTHER_PK, accounts(1)).build());
        vault.set_owner(accounts(4));
        assert_eq!(vault.get_vault_state().owner_id, accounts(4));
        testing_env!(context(OTHER_PK, accounts(4)).build());
        vault.emergency_revoke_and_freeze();
        assert!(vault.get_vault_state().is_frozen);
    }

    #[test]
    #[should_panic(expected = "only the vault owner")]
    fn old_owner_loses_control() {
        let mut vault = setup();
        testing_env!(context(OTHER_PK, accounts(1)).build());
        vault.set_owner(accounts(4));
        vault.emergency_revoke_and_freeze();
    }

    #[test]
    fn migrates_v2_state_and_history() {
        testing_env!(context(OTHER_PK, accounts(0)).build());
        let mut signers = IterableSet::new(b"s");
        signers.insert(address_of(&tee_key()));
        let mut payees = IterableSet::new(b"p");
        payees.insert(accounts(2));
        let mut old_exec = Vector::new(b"e");
        old_exec.push(migration::ExecutionRecordV2 {
            nonce: 1,
            action: "pay".into(),
            amount: NearToken::from_millinear(50),
            payee: Some(accounts(2)),
            chain: None,
            derivation_path: None,
            reason: "old".into(),
            request_hash: "aa".repeat(32),
            response_hash: "bb".repeat(32),
            ai_signer: address_of(&tee_key()),
            block_timestamp_ns: 1,
        });
        let mut used = LookupSet::new(b"u");
        used.insert("bb".repeat(32));
        // On-chain these are flushed at the end of each call; here we write them out by hand
        signers.flush();
        payees.flush();
        old_exec.flush();
        let old = migration::GhostVaultV2 {
            owner_id: accounts(1),
            agent_pk: AGENT_PK.parse().unwrap(),
            daily_budget_cap: NearToken::from_near(1),
            daily_spent: NearToken::from_millinear(50),
            last_window_start_ns: NOW_S * 1_000_000_000,
            is_frozen: false,
            execution_nonce: 1,
            mpc_signer_contract: "v1.signer-prod.testnet".parse().unwrap(),
            attested_signers: signers,
            approved_payees: payees,
            used_responses: used,
            executions: old_exec,
        };
        env::state_write(&old);

        let vault = GhostVault::migrate();
        let state = vault.get_vault_state();
        assert_eq!(state.owner_id, accounts(1));
        assert_eq!(state.execution_count, 1);
        assert_eq!(state.attested_signers, vec![address_of(&tee_key())]);
        assert_eq!(state.evm_chain_id, SEPOLIA_CHAIN_ID);
        let recs = vault.get_executions(None);
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].reason, "old");
        assert!(vault.used_responses.contains(&"bb".repeat(32)));
    }

    #[test]
    fn parses_amounts() {
        assert_eq!(parse_decimal("1", 24, "a"), 10u128.pow(24));
        assert_eq!(parse_decimal("0.25", 24, "a"), 25 * 10u128.pow(22));
        assert_eq!(parse_decimal("0.000000000000000000000001", 24, "a"), 1);
        assert_eq!(parse_decimal("0.001", 18, "a"), 10u128.pow(15));
    }

    #[test]
    fn spend_window_resets_after_24h() {
        let mut vault = setup();
        let att = attest(&tee_key(), &response(&pay_plan("4", accounts(2).as_str()), NOW_S));
        let _ = vault.execute_attested(att, None);

        let later = NOW_S + 86_401;
        let mut ctx = context(AGENT_PK, accounts(0));
        ctx.block_timestamp(later * 1_000_000_000);
        testing_env!(ctx.build());
        let att = attest(&tee_key(), &response(&pay_plan("4", accounts(2).as_str()), later));
        let _ = vault.execute_attested(att, None);
        assert_eq!(vault.get_vault_state().daily_spent_today, NearToken::from_near(4));
    }
}

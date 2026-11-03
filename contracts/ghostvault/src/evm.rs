//! Minimal EIP-1559 (type 2) transaction encoding for plain ETH transfers.

use near_sdk::env;

pub struct Eip1559Transfer {
    pub chain_id: u64,
    pub nonce: u64,
    pub max_priority_fee_per_gas: u128,
    pub max_fee_per_gas: u128,
    /// 20-byte recipient
    pub to: Vec<u8>,
    pub value: u128,
}

pub const TRANSFER_GAS_LIMIT: u64 = 21_000;

impl Eip1559Transfer {
    /// keccak256(0x02 || rlp([chainId, nonce, maxPriorityFee, maxFee, gasLimit, to, value, data, accessList]))
    pub fn signing_hash(&self) -> [u8; 32] {
        let fields = vec![
            rlp_uint(self.chain_id as u128),
            rlp_uint(self.nonce as u128),
            rlp_uint(self.max_priority_fee_per_gas),
            rlp_uint(self.max_fee_per_gas),
            rlp_uint(TRANSFER_GAS_LIMIT as u128),
            rlp_bytes(&self.to),
            rlp_uint(self.value),
            rlp_bytes(&[]),
            rlp_list(&[]),
        ];
        let mut payload = vec![0x02];
        payload.extend(rlp_list(&fields));
        env::keccak256_array(&payload)
    }
}

fn length_prefix(len: usize, short: u8, long: u8) -> Vec<u8> {
    if len <= 55 {
        vec![short + len as u8]
    } else {
        let be = (len as u64).to_be_bytes();
        let be: Vec<u8> = be.iter().copied().skip_while(|b| *b == 0).collect();
        let mut out = vec![long + be.len() as u8];
        out.extend(be);
        out
    }
}

pub fn rlp_bytes(b: &[u8]) -> Vec<u8> {
    if b.len() == 1 && b[0] < 0x80 {
        return b.to_vec();
    }
    let mut out = length_prefix(b.len(), 0x80, 0xb7);
    out.extend_from_slice(b);
    out
}

pub fn rlp_uint(v: u128) -> Vec<u8> {
    let be: Vec<u8> = v.to_be_bytes().iter().copied().skip_while(|b| *b == 0).collect();
    rlp_bytes(&be)
}

pub fn rlp_list(items: &[Vec<u8>]) -> Vec<u8> {
    let body: Vec<u8> = items.concat();
    let mut out = length_prefix(body.len(), 0xc0, 0xf7);
    out.extend(body);
    out
}

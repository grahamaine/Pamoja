use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum JobStatus {
    Created,   // job exists, nothing deposited yet
    Funded,    // customer's payment is locked in the vault
    Released,  // provider has been paid
    Cancelled, // cancelled before funding
    Refunded,  // customer got the money back
}

impl JobStatus {
    /// Nothing more can happen to the job; the customer may close it to reclaim its rent.
    pub fn is_final(self) -> bool {
        matches!(self, JobStatus::Released | JobStatus::Cancelled | JobStatus::Refunded)
    }
}

/// One service booking: a customer pays a provider once the work is confirmed.
///
/// Timeline:
///   now <= deadline : only `release` can move the money (to the provider)
///   now >  deadline : only `refund` can move the money (back to the customer)
/// The two windows never overlap, so release and refund can never race each other.
#[account]
#[derive(InitSpace)]
pub struct Job {
    pub customer: Pubkey,
    pub provider: Pubkey,
    pub mint: Pubkey,        // the stablecoin (e.g. USDC)
    pub amount: u64,         // in the mint's smallest unit
    #[max_len(8)]
    pub reference: String,   // public goods/service abbreviation, e.g. "HAIR"
    pub attestor: Pubkey,    // confirmation service that checks the SMS code off-chain
    pub deadline: i64,       // last moment release is allowed; refund opens right after it
    pub job_id: u64,         // lets one customer have many jobs
    pub status: JobStatus,
    pub bump: u8,
}

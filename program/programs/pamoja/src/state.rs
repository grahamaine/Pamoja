use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum JobStatus {
    Created,   // job exists, nothing deposited yet
    Funded,    // customer's payment is locked in the vault
    Released,  // provider has been paid
    Cancelled, // cancelled before funding
    Refunded,  // customer got the money back
    Delivered, // provider says the work is done; the customer's dispute window is running
    Disputed,  // customer disputed the delivery; the confirmation service decides
}

impl JobStatus {
    /// Nothing more can happen to the job; the customer may close it to reclaim its rent.
    pub fn is_final(self) -> bool {
        matches!(self, JobStatus::Released | JobStatus::Cancelled | JobStatus::Refunded)
    }
}

/// One service booking: a customer pays a provider once the work is confirmed.
///
/// Timeline while the job is Funded:
///   now <= deadline : `release` (customer's code) pays the provider, or the provider marks the
///                     job Delivered
///   now >  deadline : only `refund` can move the money (back to the customer)
/// The two windows never overlap, so release and refund can never race each other.
///
/// Once Delivered, the refund path is closed. The customer has `dispute_window` seconds to dispute:
///   no dispute     : after the window the provider can `claim` the payment
///   disputed       : the attestor decides, with `release` (provider) or `resolve_refund` (customer)
/// So a customer can no longer withhold the code and simply wait out the deadline.
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
    pub dispute_window: i64, // seconds the customer has to dispute after the provider marks delivered
    pub delivered_at: i64,   // when the provider marked the job delivered; 0 until then
}

impl Job {
    /// Last moment the customer can dispute a delivered job.
    pub fn dispute_ends(&self) -> i64 {
        self.delivered_at.saturating_add(self.dispute_window)
    }
}

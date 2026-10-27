pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

// Same address as the program already on devnet, so existing jobs keep working after an upgrade.
declare_id!("9dLzUWtKppSVHsBBAAea7nqhWUy2pzY3E19PrnGdP2Q4");

#[program]
pub mod pamoja {
    use super::*;

    pub fn create_job(
        ctx: Context<CreateJob>,
        job_id: u64,
        provider: Pubkey,
        mint: Pubkey,
        amount: u64,
        reference: String,
        attestor: Pubkey,
        deadline: i64,
    ) -> Result<()> {
        create_job::handler(ctx, job_id, provider, mint, amount, reference, attestor, deadline)
    }

    pub fn fund_job(ctx: Context<FundJob>) -> Result<()> {
        fund_job::handler(ctx)
    }

    pub fn release(ctx: Context<Release>) -> Result<()> {
        release::handler(ctx)
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        cancel::handler(ctx)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        refund::handler(ctx)
    }

    pub fn close_job(ctx: Context<CloseJob>) -> Result<()> {
        close_job::handler(ctx)
    }
}

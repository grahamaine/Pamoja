use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::{Job, JOB_SEED};

/// Deletes a finished job (released, cancelled or refunded) and returns its rent to the customer.
/// Kept separate from release/refund so the job stays visible on-chain as a receipt until the
/// customer chooses to clean it up.
#[derive(Accounts)]
pub struct CloseJob<'info> {
    #[account(mut)]
    pub customer: Signer<'info>,

    #[account(
        mut,
        close = customer,
        has_one = customer @ ErrorCode::NotCustomer,
        seeds = [JOB_SEED.as_bytes(), job.customer.as_ref(), &job.job_id.to_le_bytes()],
        bump = job.bump
    )]
    pub job: Account<'info, Job>,
}

pub fn handler(ctx: Context<CloseJob>) -> Result<()> {
    require!(ctx.accounts.job.status.is_final(), ErrorCode::JobNotFinished);
    Ok(())
}

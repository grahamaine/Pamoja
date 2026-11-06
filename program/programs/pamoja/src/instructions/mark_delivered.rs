use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::{Job, JobStatus, JOB_SEED};

#[derive(Accounts)]
pub struct MarkDelivered<'info> {
    pub provider: Signer<'info>,

    #[account(
        mut,
        has_one = provider @ ErrorCode::NotProvider,
        seeds = [JOB_SEED.as_bytes(), job.customer.as_ref(), &job.job_id.to_le_bytes()],
        bump = job.bump
    )]
    pub job: Account<'info, Job>,
}

pub fn handler(ctx: Context<MarkDelivered>) -> Result<()> {
    let job = &mut ctx.accounts.job;
    require!(job.status == JobStatus::Funded, ErrorCode::WrongStatus);
    // Same window as release: after the deadline the money already belongs to the refund path.
    let now = Clock::get()?.unix_timestamp;
    require!(now <= job.deadline, ErrorCode::DeadlinePassed);

    job.status = JobStatus::Delivered;
    job.delivered_at = now;
    Ok(())
}

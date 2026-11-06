use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::{Job, JobStatus, JOB_SEED};

#[derive(Accounts)]
pub struct Dispute<'info> {
    pub customer: Signer<'info>,

    #[account(
        mut,
        has_one = customer @ ErrorCode::NotCustomer,
        seeds = [JOB_SEED.as_bytes(), job.customer.as_ref(), &job.job_id.to_le_bytes()],
        bump = job.bump
    )]
    pub job: Account<'info, Job>,
}

pub fn handler(ctx: Context<Dispute>) -> Result<()> {
    let job = &mut ctx.accounts.job;
    require!(job.status == JobStatus::Delivered, ErrorCode::WrongStatus);
    // Disputing and claiming never overlap: dispute up to the end of the window, claim strictly after.
    require!(
        Clock::get()?.unix_timestamp <= job.dispute_ends(),
        ErrorCode::DisputeWindowClosed
    );

    job.status = JobStatus::Disputed;
    Ok(())
}

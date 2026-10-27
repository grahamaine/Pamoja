use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::{Job, JobStatus, JOB_SEED};

#[derive(Accounts)]
pub struct Cancel<'info> {
    pub customer: Signer<'info>,

    #[account(
        mut,
        has_one = customer @ ErrorCode::NotCustomer,
        seeds = [JOB_SEED.as_bytes(), job.customer.as_ref(), &job.job_id.to_le_bytes()],
        bump = job.bump
    )]
    pub job: Account<'info, Job>,
}

pub fn handler(ctx: Context<Cancel>) -> Result<()> {
    // Only a job that has not been funded can be cancelled: there is no money to return.
    // The customer can then call close_job to get the job's rent back.
    require!(ctx.accounts.job.status == JobStatus::Created, ErrorCode::WrongStatus);
    ctx.accounts.job.status = JobStatus::Cancelled;
    Ok(())
}

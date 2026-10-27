use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::{Job, JobStatus, JOB_SEED};

#[derive(Accounts)]
#[instruction(job_id: u64)]
pub struct CreateJob<'info> {
    #[account(mut)]
    pub customer: Signer<'info>,

    #[account(
        init,
        payer = customer,
        space = 8 + Job::INIT_SPACE,
        seeds = [JOB_SEED.as_bytes(), customer.key().as_ref(), &job_id.to_le_bytes()],
        bump
    )]
    pub job: Account<'info, Job>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateJob>,
    job_id: u64,
    provider: Pubkey,
    mint: Pubkey,
    amount: u64,
    reference: String,
    attestor: Pubkey,
    deadline: i64,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(
        (2..=8).contains(&reference.len())
            && reference.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit()),
        ErrorCode::InvalidReference
    );
    require!(deadline > Clock::get()?.unix_timestamp, ErrorCode::DeadlineInPast);

    let job = &mut ctx.accounts.job;
    job.customer = ctx.accounts.customer.key();
    job.provider = provider;
    job.mint = mint;
    job.amount = amount;
    job.reference = reference;
    job.attestor = attestor;
    job.deadline = deadline;
    job.job_id = job_id;
    job.status = JobStatus::Created;
    job.bump = ctx.bumps.job;
    Ok(())
}

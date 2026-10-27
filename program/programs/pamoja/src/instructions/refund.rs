use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use super::vault::pay_out_and_close;
use crate::error::ErrorCode;
use crate::{Job, JobStatus, JOB_SEED, VAULT_SEED};

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub customer: Signer<'info>,

    #[account(
        mut,
        has_one = customer @ ErrorCode::NotCustomer,
        has_one = mint @ ErrorCode::WrongMint,
        seeds = [JOB_SEED.as_bytes(), job.customer.as_ref(), &job.job_id.to_le_bytes()],
        bump = job.bump
    )]
    pub job: Account<'info, Job>,

    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [VAULT_SEED.as_bytes(), job.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = job,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = customer,
        token::token_program = token_program
    )]
    pub customer_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<Refund>) -> Result<()> {
    require!(ctx.accounts.job.status == JobStatus::Funded, ErrorCode::WrongStatus);
    // Refund opens strictly after the deadline, so it never overlaps with release.
    require!(
        Clock::get()?.unix_timestamp > ctx.accounts.job.deadline,
        ErrorCode::TooEarly
    );

    let a = &ctx.accounts;
    pay_out_and_close(
        &a.job,
        &a.vault,
        &a.mint,
        a.customer_token_account.to_account_info(),
        a.customer.to_account_info(),
        &a.token_program,
    )?;

    ctx.accounts.job.status = JobStatus::Refunded;
    Ok(())
}

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use super::vault::pay_out_and_close;
use crate::error::ErrorCode;
use crate::{Job, JobStatus, JOB_SEED, VAULT_SEED};

/// The provider marked the job delivered and the customer did not dispute in time: the provider
/// takes the payment without the customer's code.
#[derive(Accounts)]
pub struct Claim<'info> {
    pub provider: Signer<'info>,

    #[account(
        mut,
        has_one = provider @ ErrorCode::NotProvider,
        has_one = mint @ ErrorCode::WrongMint,
        has_one = customer @ ErrorCode::NotCustomer,
        seeds = [JOB_SEED.as_bytes(), job.customer.as_ref(), &job.job_id.to_le_bytes()],
        bump = job.bump
    )]
    pub job: Account<'info, Job>,

    /// Receives the vault's rent back (the customer paid it in `fund_job`). Not a signer.
    #[account(mut)]
    pub customer: SystemAccount<'info>,

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
        token::authority = provider,
        token::token_program = token_program
    )]
    pub provider_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<Claim>) -> Result<()> {
    require!(ctx.accounts.job.status == JobStatus::Delivered, ErrorCode::WrongStatus);
    require!(
        Clock::get()?.unix_timestamp > ctx.accounts.job.dispute_ends(),
        ErrorCode::DisputeWindowOpen
    );

    let a = &ctx.accounts;
    pay_out_and_close(
        &a.job,
        &a.vault,
        &a.mint,
        a.provider_token_account.to_account_info(),
        a.customer.to_account_info(),
        &a.token_program,
    )?;

    ctx.accounts.job.status = JobStatus::Released;
    Ok(())
}

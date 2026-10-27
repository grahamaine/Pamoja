use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use super::vault::pay_out_and_close;
use crate::error::ErrorCode;
use crate::{Job, JobStatus, JOB_SEED, VAULT_SEED};

#[derive(Accounts)]
pub struct Release<'info> {
    /// The confirmation service. It signs only after checking the customer's SMS code off-chain.
    pub attestor: Signer<'info>,

    #[account(
        mut,
        has_one = attestor @ ErrorCode::NotAttestor,
        has_one = mint @ ErrorCode::WrongMint,
        has_one = customer @ ErrorCode::NotCustomer,
        seeds = [JOB_SEED.as_bytes(), job.customer.as_ref(), &job.job_id.to_le_bytes()],
        bump = job.bump
    )]
    pub job: Account<'info, Job>,

    /// Receives the vault's rent back. Not a signer: the customer does not need to be present.
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
        token::authority = job.provider,
        token::token_program = token_program
    )]
    pub provider_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<Release>) -> Result<()> {
    require!(ctx.accounts.job.status == JobStatus::Funded, ErrorCode::WrongStatus);
    // Release is only possible up to the deadline; after it, the money belongs to the refund path.
    require!(
        Clock::get()?.unix_timestamp <= ctx.accounts.job.deadline,
        ErrorCode::DeadlinePassed
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

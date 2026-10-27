use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{Job, JOB_SEED};

/// Pays out everything in the job's vault to `to`, then closes the vault and returns its rent to
/// `rent_to` (the customer, who paid it in `fund_job`). The program signs as the job PDA.
///
/// It sends the vault's whole balance rather than `job.amount`: anyone can send extra tokens to a
/// vault, and a token account with a balance cannot be closed. Sending everything means a stray
/// deposit can never block a release or refund.
pub(crate) fn pay_out_and_close<'info>(
    job: &Account<'info, Job>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: AccountInfo<'info>,
    rent_to: AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    let job_id = job.job_id.to_le_bytes();
    let bump = [job.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[JOB_SEED.as_bytes(), job.customer.as_ref(), &job_id, &bump]];

    transfer_checked(
        CpiContext::new_with_signer(
            token_program.key(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to,
                authority: job.to_account_info(),
            },
            signer_seeds,
        ),
        vault.amount,
        mint.decimals,
    )?;

    close_account(CpiContext::new_with_signer(
        token_program.key(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: rent_to,
            authority: job.to_account_info(),
        },
        signer_seeds,
    ))
}

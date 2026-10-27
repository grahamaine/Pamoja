use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Deadline must be in the future")]
    DeadlineInPast,
    #[msg("Job is not in the right status for this action")]
    WrongStatus,
    #[msg("Reference must be 2-8 uppercase letters or digits")]
    InvalidReference,
    #[msg("Only the confirmation service can release funds")]
    NotAttestor,
    #[msg("Only the customer can do this")]
    NotCustomer,
    #[msg("The token does not match this job")]
    WrongMint,
    #[msg("The deadline has not passed yet")]
    TooEarly,
    #[msg("The deadline has passed; the customer can now reclaim the payment")]
    DeadlinePassed,
    #[msg("The job is still open and cannot be closed")]
    JobNotFinished,
}

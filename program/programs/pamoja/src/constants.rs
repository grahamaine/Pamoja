use anchor_lang::prelude::*;

#[constant]
pub const JOB_SEED: &str = "job";

#[constant]
pub const VAULT_SEED: &str = "vault";

/// Shortest dispute window a job can have (one minute, so the flow can be demonstrated live).
#[constant]
pub const MIN_DISPUTE_WINDOW: i64 = 60;

/// Longest dispute window a job can have (seven days).
#[constant]
pub const MAX_DISPUTE_WINDOW: i64 = 7 * 24 * 60 * 60;

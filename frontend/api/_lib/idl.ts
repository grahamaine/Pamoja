// Generated from src/idl/pamoja.json. Re-generate after changing the program:
//   node scripts/sync-idl.mjs
/* eslint-disable */
export const IDL: any = {
  "address": "9dLzUWtKppSVHsBBAAea7nqhWUy2pzY3E19PrnGdP2Q4",
  "metadata": {
    "name": "pamoja",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Pamoja: pay-when-done service escrow on Solana"
  },
  "instructions": [
    {
      "name": "cancel",
      "discriminator": [
        232,
        219,
        223,
        41,
        219,
        236,
        220,
        190
      ],
      "accounts": [
        {
          "name": "customer",
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "job.customer",
                "account": "Job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "Job"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "claim",
      "docs": [
        "Provider: the dispute window passed with no dispute, so take the payment."
      ],
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "provider",
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "job.customer",
                "account": "Job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "Job"
              }
            ]
          }
        },
        {
          "name": "customer",
          "docs": [
            "Receives the vault's rent back (the customer paid it in `fund_job`). Not a signer."
          ],
          "writable": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "job"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "provider_token_account",
          "writable": true
        },
        {
          "name": "token_program"
        }
      ],
      "args": []
    },
    {
      "name": "close_job",
      "discriminator": [
        90,
        100,
        180,
        200,
        200,
        163,
        120,
        182
      ],
      "accounts": [
        {
          "name": "customer",
          "writable": true,
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "job.customer",
                "account": "Job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "Job"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "create_job",
      "discriminator": [
        178,
        130,
        217,
        110,
        100,
        27,
        82,
        119
      ],
      "accounts": [
        {
          "name": "customer",
          "writable": true,
          "signer": true
        },
        {
          "name": "job",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "customer"
              },
              {
                "kind": "arg",
                "path": "job_id"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "job_id",
          "type": "u64"
        },
        {
          "name": "provider",
          "type": "pubkey"
        },
        {
          "name": "mint",
          "type": "pubkey"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "reference",
          "type": "string"
        },
        {
          "name": "attestor",
          "type": "pubkey"
        },
        {
          "name": "deadline",
          "type": "i64"
        },
        {
          "name": "dispute_window",
          "type": "i64"
        }
      ]
    },
    {
      "name": "dispute",
      "docs": [
        "Customer: the work was not done. Freezes the job until the attestor decides."
      ],
      "discriminator": [
        216,
        92,
        128,
        146,
        202,
        85,
        135,
        73
      ],
      "accounts": [
        {
          "name": "customer",
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "job.customer",
                "account": "Job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "Job"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "fund_job",
      "discriminator": [
        244,
        198,
        4,
        15,
        41,
        178,
        169,
        187
      ],
      "accounts": [
        {
          "name": "customer",
          "writable": true,
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "customer"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "Job"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "job"
          ]
        },
        {
          "name": "customer_token_account",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "token_program"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "mark_delivered",
      "docs": [
        "Provider: the work is done. Starts the customer's dispute window and closes the refund path."
      ],
      "discriminator": [
        240,
        118,
        188,
        142,
        64,
        85,
        107,
        18
      ],
      "accounts": [
        {
          "name": "provider",
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "job.customer",
                "account": "Job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "Job"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "refund",
      "discriminator": [
        2,
        96,
        183,
        251,
        63,
        208,
        46,
        46
      ],
      "accounts": [
        {
          "name": "customer",
          "writable": true,
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "job.customer",
                "account": "Job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "Job"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "job"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "customer_token_account",
          "writable": true
        },
        {
          "name": "token_program"
        }
      ],
      "args": []
    },
    {
      "name": "release",
      "discriminator": [
        253,
        249,
        15,
        206,
        28,
        127,
        193,
        241
      ],
      "accounts": [
        {
          "name": "attestor",
          "docs": [
            "The confirmation service. It signs only after checking the customer's SMS code off-chain,",
            "or after deciding a dispute in the provider's favour."
          ],
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "job.customer",
                "account": "Job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "Job"
              }
            ]
          }
        },
        {
          "name": "customer",
          "docs": [
            "Receives the vault's rent back. Not a signer: the customer does not need to be present."
          ],
          "writable": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "job"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "provider_token_account",
          "writable": true
        },
        {
          "name": "token_program"
        }
      ],
      "args": []
    },
    {
      "name": "resolve_refund",
      "docs": [
        "Attestor: a dispute was decided in the customer's favour; return the payment."
      ],
      "discriminator": [
        32,
        83,
        239,
        245,
        3,
        75,
        181,
        35
      ],
      "accounts": [
        {
          "name": "attestor",
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "job.customer",
                "account": "Job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "Job"
              }
            ]
          }
        },
        {
          "name": "customer",
          "docs": [
            "Receives the vault's rent back. Not a signer: the customer does not need to be present."
          ],
          "writable": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "job"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "job"
              }
            ]
          }
        },
        {
          "name": "customer_token_account",
          "writable": true
        },
        {
          "name": "token_program"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "Job",
      "discriminator": [
        75,
        124,
        80,
        203,
        161,
        180,
        202,
        80
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InvalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6001,
      "name": "DeadlineInPast",
      "msg": "Deadline must be in the future"
    },
    {
      "code": 6002,
      "name": "WrongStatus",
      "msg": "Job is not in the right status for this action"
    },
    {
      "code": 6003,
      "name": "InvalidReference",
      "msg": "Reference must be 2-8 uppercase letters or digits"
    },
    {
      "code": 6004,
      "name": "NotAttestor",
      "msg": "Only the confirmation service can release funds"
    },
    {
      "code": 6005,
      "name": "NotCustomer",
      "msg": "Only the customer can do this"
    },
    {
      "code": 6006,
      "name": "WrongMint",
      "msg": "The token does not match this job"
    },
    {
      "code": 6007,
      "name": "TooEarly",
      "msg": "The deadline has not passed yet"
    },
    {
      "code": 6008,
      "name": "DeadlinePassed",
      "msg": "The deadline has passed; the customer can now reclaim the payment"
    },
    {
      "code": 6009,
      "name": "JobNotFinished",
      "msg": "The job is still open and cannot be closed"
    },
    {
      "code": 6010,
      "name": "InvalidDisputeWindow",
      "msg": "Dispute window must be between 1 minute and 7 days"
    },
    {
      "code": 6011,
      "name": "NotProvider",
      "msg": "Only the provider can do this"
    },
    {
      "code": 6012,
      "name": "DisputeWindowOpen",
      "msg": "The customer can still dispute this delivery"
    },
    {
      "code": 6013,
      "name": "DisputeWindowClosed",
      "msg": "The dispute window for this delivery has closed"
    }
  ],
  "types": [
    {
      "name": "Job",
      "docs": [
        "One service booking: a customer pays a provider once the work is confirmed.",
        "",
        "Timeline while the job is Funded:",
        "now <= deadline : `release` (customer's code) pays the provider, or the provider marks the",
        "job Delivered",
        "now >  deadline : only `refund` can move the money (back to the customer)",
        "The two windows never overlap, so release and refund can never race each other.",
        "",
        "Once Delivered, the refund path is closed. The customer has `dispute_window` seconds to dispute:",
        "no dispute     : after the window the provider can `claim` the payment",
        "disputed       : the attestor decides, with `release` (provider) or `resolve_refund` (customer)",
        "So a customer can no longer withhold the code and simply wait out the deadline."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "customer",
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "reference",
            "type": "string"
          },
          {
            "name": "attestor",
            "type": "pubkey"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "job_id",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "JobStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "dispute_window",
            "type": "i64"
          },
          {
            "name": "delivered_at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "JobStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Created"
          },
          {
            "name": "Funded"
          },
          {
            "name": "Released"
          },
          {
            "name": "Cancelled"
          },
          {
            "name": "Refunded"
          },
          {
            "name": "Delivered"
          },
          {
            "name": "Disputed"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "JOB_SEED",
      "type": "string",
      "value": "\"job\""
    },
    {
      "name": "MAX_DISPUTE_WINDOW",
      "docs": [
        "Longest dispute window a job can have (seven days)."
      ],
      "type": "i64",
      "value": "604800"
    },
    {
      "name": "MIN_DISPUTE_WINDOW",
      "docs": [
        "Shortest dispute window a job can have (one minute, so the flow can be demonstrated live)."
      ],
      "type": "i64",
      "value": "60"
    },
    {
      "name": "VAULT_SEED",
      "type": "string",
      "value": "\"vault\""
    }
  ]
}

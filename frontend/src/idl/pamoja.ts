/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/pamoja.json`.
 */
export type Pamoja = {
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
                "account": "job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "job"
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
                "account": "job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "job"
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
          "name": "providerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "closeJob",
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
                "account": "job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "job"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createJob",
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
                "path": "jobId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "jobId",
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
          "name": "disputeWindow",
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
                "account": "job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "job"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "fundJob",
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
                "account": "job"
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
          "name": "customerTokenAccount",
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
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "markDelivered",
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
                "account": "job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "job"
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
                "account": "job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "job"
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
          "name": "customerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
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
                "account": "job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "job"
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
          "name": "providerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "resolveRefund",
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
                "account": "job"
              },
              {
                "kind": "account",
                "path": "job.job_id",
                "account": "job"
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
          "name": "customerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "job",
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
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6001,
      "name": "deadlineInPast",
      "msg": "Deadline must be in the future"
    },
    {
      "code": 6002,
      "name": "wrongStatus",
      "msg": "Job is not in the right status for this action"
    },
    {
      "code": 6003,
      "name": "invalidReference",
      "msg": "Reference must be 2-8 uppercase letters or digits"
    },
    {
      "code": 6004,
      "name": "notAttestor",
      "msg": "Only the confirmation service can release funds"
    },
    {
      "code": 6005,
      "name": "notCustomer",
      "msg": "Only the customer can do this"
    },
    {
      "code": 6006,
      "name": "wrongMint",
      "msg": "The token does not match this job"
    },
    {
      "code": 6007,
      "name": "tooEarly",
      "msg": "The deadline has not passed yet"
    },
    {
      "code": 6008,
      "name": "deadlinePassed",
      "msg": "The deadline has passed; the customer can now reclaim the payment"
    },
    {
      "code": 6009,
      "name": "jobNotFinished",
      "msg": "The job is still open and cannot be closed"
    },
    {
      "code": 6010,
      "name": "invalidDisputeWindow",
      "msg": "Dispute window must be between 1 minute and 7 days"
    },
    {
      "code": 6011,
      "name": "notProvider",
      "msg": "Only the provider can do this"
    },
    {
      "code": 6012,
      "name": "disputeWindowOpen",
      "msg": "The customer can still dispute this delivery"
    },
    {
      "code": 6013,
      "name": "disputeWindowClosed",
      "msg": "The dispute window for this delivery has closed"
    }
  ],
  "types": [
    {
      "name": "job",
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
            "name": "jobId",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "jobStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "disputeWindow",
            "type": "i64"
          },
          {
            "name": "deliveredAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "jobStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "created"
          },
          {
            "name": "funded"
          },
          {
            "name": "released"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "refunded"
          },
          {
            "name": "delivered"
          },
          {
            "name": "disputed"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "jobSeed",
      "type": "string",
      "value": "\"job\""
    },
    {
      "name": "maxDisputeWindow",
      "docs": [
        "Longest dispute window a job can have (seven days)."
      ],
      "type": "i64",
      "value": "604800"
    },
    {
      "name": "minDisputeWindow",
      "docs": [
        "Shortest dispute window a job can have (one minute, so the flow can be demonstrated live)."
      ],
      "type": "i64",
      "value": "60"
    },
    {
      "name": "vaultSeed",
      "type": "string",
      "value": "\"vault\""
    }
  ]
};

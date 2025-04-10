import { z } from "zod"

// Schema definitions
export const BlockNumberSchema = z.object({})

export const GetBalanceSchema = z.object({
  address: z.string().describe('The address to check balance for'),
  block: z.string().optional().describe('The block number to check balance at'),
})

export const GetTransactionCountSchema = z.object({
  address: z.string().describe('The address to check nonce for'),
  block: z.string().optional().describe('The block number to check nonce at'),
})

export const GetBlockByNumberSchema = z.object({
  blockNumber: z.string().describe('The block number to get information for'),
})

export const GetTransactionByHashSchema = z.object({
  txHash: z.string().describe('The transaction hash to get information for'),
})

export const CallSchema = z.object({
  to: z.string().describe('The contract address to call'),
  data: z.string().describe('The encoded function call data'),
  block: z.string().optional().describe('The block number to make the call at'),
})

export const ChainIdSchema = z.object({})

export const TraceTransactionSchema = z.object({
  txHash: z.string().describe('The transaction hash to trace'),
})
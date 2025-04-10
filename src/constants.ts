import dotenv from 'dotenv'

dotenv.config()

// API_URL is the URL of the Game7 API
export const API_URL = process.env.API_URL
// RPC_URL is the URL of the Game7 RPC
export const RPC_URL = process.env.RPC_URL

export const DEBUG = process.env.DEBUG === 'true'

export type Network = 'mainnet' | 'testnet'
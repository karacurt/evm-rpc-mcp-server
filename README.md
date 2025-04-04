# RPC MCP Server

This is a Model Context Protocol (MCP) server implementation for interacting with any EVM-compatible RPC endpoint. It provides a standardized interface for AI models to interact with Ethereum and EVM-compatible blockchains.

## Features

- Support for any EVM-compatible RPC endpoint
- Get current block number
- Check account balances
- Get transaction counts (nonces)
- Retrieve block information
- Get transaction details
- Make contract calls

## Prerequisites

- Node.js (v16 or higher)
- npm (Node Package Manager)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd rpc-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Install globally:
```bash
npm install -g .
```

This global installation makes the `rpc-mcp` command available system-wide, which is required for Cursor to find and execute the MCP server.

## Configuration

The server uses the following environment variable:

- `RPC_URL`: The RPC endpoint URL to connect to (e.g., 'https://mainnet-rpc.game7.io' or 'https://testnet-rpc.game7.io')
- `API_URL`: The API endpoint URL to connect to (e.g., 'https://mainnet.game7.io/api' or 'https://testnet.game7.io/api')

### Cursor MCP Configuration

Add the following to your `mcp.json` file in your Cursor (Settings > MCP > Add New Global Server):

```json
{
  "mcpServers": {
    "rpc-mcp": {
      "command": "npx",
      "args": ["-y", "rpc-mcp"],
      "env": {
        "RPC_URL": "YOUR_RPC_ENDPOINT",
        "API_URL": "YOUR_API_ENDPOINT"
      }
    }
  } 
}
```

This configuration will make the following tools available in Cursor:

- `eth_blockNumber`
- `eth_getBalance`
- `eth_getTransactionCount`
- `eth_getBlockByNumber`
- `eth_getTransactionByHash`
- `eth_call`
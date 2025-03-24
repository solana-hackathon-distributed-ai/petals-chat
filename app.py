import hivemind
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sock import Sock
import utils
import views
from solana.rpc.api import Client
from solana.publickey import PublicKey
from solana.transaction import Transaction
from solana.transaction import TransactionInstruction, AccountMeta
from solana.rpc.async_api import AsyncClient
from solana.rpc.types import TxOpts
from solana.keypair import Keypair
from solana.rpc.commitment import Confirmed
import json
import base64
import logging
import struct




app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SOLANA_RPC_URL = "https://api.devnet.solana.com"
AI_TOKEN_MINT = "4pQaVgu9BdjTkms4pm2VqbTypqKB4URLHVKsakvqFeh4"
AI_PAYMENT_WALLET = "4d9WDb8dWs5FKCyQxMXAtiwDDsiqFitj6A3PEkz3mK8y"
SYSTEM_PROGRAM_ID = PublicKey("11111111111111111111111111111111")
logger.info("Loading models")
models = utils.load_models()

logger.info("Starting Flask app")
app = Flask(__name__)
CORS(app)
app.config["SOCK_SERVER_OPTIONS"] = {"ping_interval": 25}
sock = Sock(app)

logger.info("Pre-rendering index page")
index_html = views.render_index(app)
# Load wallet keypair from JSON file with more robust error handling
def load_keypair():
    try:
        with open("wallet-keypair.json", "r") as file:
            secret_key_data = json.load(file)
        
        # Handle different potential formats of secret key storage
        if isinstance(secret_key_data, list):
            # If it's a list of integers
            secret_key = bytes(secret_key_data)
        elif isinstance(secret_key_data, str):
            # If it's a base64 encoded string
            secret_key = base64.b64decode(secret_key_data)
        else:
            raise ValueError("Unsupported secret key format")
        
        return Keypair.from_secret_key(secret_key)
    except Exception as e:
        logger.error(f"Error loading keypair: {e}")
        raise

def create_transfer_instruction(from_pubkey, to_pubkey, lamports):
    """
    Manually create a transfer instruction for the System Program
    """
    # Instruction layout for transfer in the System Program
    # https://github.com/solana-labs/solana/blob/master/sdk/src/system_instruction.rs
    TRANSFER_OPCODE = 2  # Transfer instruction opcode

    # Prepare the instruction data
    instruction_data = struct.pack('<I', TRANSFER_OPCODE) + struct.pack('<Q', lamports)

    return TransactionInstruction(
        program_id=SYSTEM_PROGRAM_ID,
        keys=[
            AccountMeta(pubkey=from_pubkey, is_signer=True, is_writable=True),
            AccountMeta(pubkey=to_pubkey, is_signer=False, is_writable=True)
        ],
        data=instruction_data
    )

@app.route('/pay', methods=['POST'])
async def pay():
    try:
        data = request.json
        sender = data['sender']
        token_count = data['token_count']
        sender_pubkey = PublicKey(sender)
        receiver_pubkey = PublicKey(AI_PAYMENT_WALLET)

        # Calculate the cost based on the number of tokens generated
        cost_per_token = 1 * 10 ** 6  # 1 token with 6 decimals
        total_cost = token_count * cost_per_token

        # Get recent blockhash for transaction
        async with AsyncClient(SOLANA_RPC_URL) as client:
            blockhash_response = await client.get_latest_blockhash()
            logger.info(f"Blockhash response: {blockhash_response}")
            
            # Correctly extract blockhash as a string
            blockhash = str(blockhash_response.value.blockhash)

        # Create the transaction
        transaction = Transaction()
        transaction.recent_blockhash = blockhash
        transaction.fee_payer = sender_pubkey

        # Add transfer instruction using custom method
        transfer_ix = create_transfer_instruction(
            from_pubkey=sender_pubkey,
            to_pubkey=receiver_pubkey,
            lamports=total_cost
        )
        transaction.add(transfer_ix)

        # Sign and send the transaction
        async with AsyncClient(SOLANA_RPC_URL) as client:
            sender_keypair = load_keypair()  # Load the keypair from JSON
            
            # Ensure the transaction is signed correctly
            transaction.sign(sender_keypair)
            
            # Serialize the transaction
            raw_transaction = transaction.serialize()
            
            # Send transaction with correct method signature
            response = await client.send_transaction(
                raw_transaction,
                opts=TxOpts(skip_preflight=False, preflight_commitment=Confirmed)
            )
           
            return jsonify({"status": "success", "signature": str(response.value)})
    
    except Exception as e:
        logger.error(f"Transaction error: {e}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 400
logger = hivemind.get_logger(__file__)


@app.route("/")
def main_page():
    return index_html

if __name__ == '__main__':
    app.run(debug=True)

import http_api
import websocket_api

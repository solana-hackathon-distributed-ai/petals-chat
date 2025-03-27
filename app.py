import hivemind
from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
from flask_sock import Sock
import utils
import views


from spl.token.constants import TOKEN_PROGRAM_ID
from solana.rpc.api import Client
from solana.transaction import Transaction
from solana.transaction import TransactionInstruction, AccountMeta
from solana.rpc.async_api import AsyncClient
from solana.rpc.types import TxOpts
from solana.keypair import Keypair
from solana.rpc.commitment import Confirmed
from spl.token.instructions import transfer_checked, get_associated_token_address,transfer, TransferParams, TransferCheckedParams
import json
import base64
import logging
import struct
from solders.pubkey import Pubkey

logger = hivemind.get_logger(__file__)

logger.info("Loading models")
models = utils.load_models()

logger.info("Starting Flask app")
app = Flask(__name__)
CORS(app)
app.config["SOCK_SERVER_OPTIONS"] = {"ping_interval": 25}
sock = Sock(app)

logger.info("Pre-rendering index page")
index_html = views.render_index(app)

# Serve static files from test directory
@app.route('/test/<path:filename>')
def serve_test(filename):
    return send_from_directory('test', filename)


SOLANA_RPC_URL = "https://api.devnet.solana.com"
AI_TOKEN_MINT = Pubkey.from_string("HubuF6KkMvxtRSdq8GmbNkaupedBiSu9ZzuzCm5nBBgs")
AI_PAYMENT_WALLET = Pubkey.from_string("7KPGDuQtgox24zsfdm86HjizGxEncZtUpzu5BuNywnsV")
SYSTEM_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
RECEIVER_WALLET = Pubkey.from_string("EK6ZQQB9k6JyNsG4ZTNbxpCSognpGBaps1StASMDFXFz")
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
        with open("wallet1.json", "r") as file:
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



@app.route('/api/pay', methods=['POST'])
async def pay():
    try:
        data = request.json
        sender = data['source']
        logger.info(f"Sender: {sender}")
        sender_pubkey = Pubkey.from_string(sender)
        logger.info(f"Sender pubkey: {sender_pubkey}")
        receiver_wallet = RECEIVER_WALLET  # Receiver wallet address

        amount_to_transfer = 1  # Amount to transfer

        # Get the associated token accounts (synchronously):
        source_token_account = get_associated_token_address(
            owner=AI_PAYMENT_WALLET,
            mint=AI_TOKEN_MINT
        )
        receiver_token_account = get_associated_token_address(
            owner=receiver_wallet,
            mint=AI_TOKEN_MINT
        )
        
        # Load the keypair for the mint authority
        #owner = load_keypair()
        #logger.info(f"Owner: {owner.public_key}")
       
        instruction = transfer_checked(
                        TransferCheckedParams(
                            program_id=TOKEN_PROGRAM_ID,
                            source=sender_pubkey,  # Use the mint authority's associated token account.
                            mint=AI_TOKEN_MINT,
                            dest=receiver_token_account,
                            owner=source_token_account,
                            amount=amount_to_transfer,
                            decimals=9,
                            signers=[]
                        )
    )



        transaction = Transaction()
        logger.info('Transaction:', transaction)
        transaction.add(instruction)
        
        async_client = AsyncClient(SOLANA_RPC_URL)
        recent_blockhash = await async_client.get_latest_blockhash()
        blockhash = recent_blockhash['result']['value']['blockhash']
        transaction.recent_blockhash = blockhash
        transaction.fee_payer = Pubkey(sender)
        serialized_tx = transaction.serialize()
        base64_tx = base64.b64encode(serialized_tx).decode('utf-8')

        return jsonify({
            "status": "success",
            "transaction": base64_tx,
            "network": "devnet"
        }), 200

    except Exception as e:
        logger.error(f"Error creating transaction: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 400





@app.route("/")
def main_page():
    return index_html

@app.route('/api/request-signature', methods=['POST'])
def request_signature():
    data = request.json  # Fixed: use request instead of requests
    # In a real app, you would prepare the transaction here
    logger.info(data)
    return jsonify({
        'message': 'Sign this message to authenticate',
        'network': 'devnet',
        'reference': 'auth-request-123'
    })

@app.route('/api/verify-signature', methods=['POST'])
def verify_signature():
    data = request.json  # Fixed: use request instead of requests
    # In a real app, you would verify the signature here
    return jsonify({
        'verified': True,
        'publicKey': data.get('publicKey'),
        'message': 'Authentication successful'
    })

import http_api
import websocket_api
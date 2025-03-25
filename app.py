import hivemind
from flask import Flask, request, jsonify
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
from spl.token.instructions import transfer_checked, get_associated_token_address, TransferCheckedParams
import json
import base64
import logging
import struct
from solders.pubkey import Pubkey



app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


SOLANA_RPC_URL = "https://api.devnet.solana.com"
AI_TOKEN_MINT = Pubkey.from_string("HubuF6KkMvxtRSdq8GmbNkaupedBiSu9ZzuzCm5nBBgs")
AI_PAYMENT_WALLET = Pubkey.from_string("7KPGDuQtgox24zsfdm86HjizGxEncZtUpzu5BuNywnsV")
SYSTEM_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
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
        with open("id.json", "r") as file:
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


SECRET_KEY=bytes([165,238,96,86,84,95,100,80,59,21,235,67,51,217,217,41,186,41,247,231,205,91,78,172,235,150,213,200,1,225,137,146,93,219,191,148,154,197,74,238,219,65,240,135,83,94,55,216,14,96,113,59,105,231,45,118,97,84,20,249,6,42,6,212])
@app.route('/pay', methods=['POST'])
async def pay():
    try:
        data = request.json
        sender = data['sender']
        #token_count = data['token_count']
        print(sender)
        sender_pubkey = Pubkey.from_string(sender)
        receiver_pubkey = AI_PAYMENT_WALLET
        print(sender)
        #print(token_count)
        # Calculate the cost based on the number of tokens generated
        cost_per_token = 1 * 10 ** 6  # 1 token with 6 decimals
        owner = load_keypair()
        transaction = Transaction()
        transaction.add(
            transfer_checked(
                TransferCheckedParams(
                    TOKEN_PROGRAM_ID, #DON'T WORRY ABOUT THIS! DON'T TOUCH IT!
                    AI_PAYMENT_WALLET, #Its not your wallet address! Its the token account address!
                    AI_TOKEN_MINT, # token address 
                    sender_pubkey, # to the receiving token account.
                    AI_PAYMENT_WALLET, # wallet address connected to the from_token_account. needs to have SOL
                    1, #amount of tokens to send.
                    9, #default decimal places. Don't touch in it most cases
                    [] #default. Don't touch it in most cases

                )
            )
        )
        client = Client(endpoint="https://api.devnet.solana.com", commitment=Confirmed) #devnet you can change it to the main net if you want
        
        print(owner)# <-- need the keypair for the token owner here! [20,103,349, ... 230,239,239]
        client.send_transaction(
            transaction, owner, opts=TxOpts(skip_confirmation=False, preflight_commitment=Confirmed)) 
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
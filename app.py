import hivemind
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sock import Sock

import utils
import views

from solana.rpc.api import Client
from solana.publickey import PublicKey
from solana.transaction import Transaction
from solana.system_program import TransferParams, transfer
from solana.rpc.async_api import AsyncClient
from solana.rpc.types import TxOpts
from solana.keypair import Keypair
from solana.rpc.commitment import Confirmed

app = Flask(__name__)
logger = hivemind.get_logger(__file__)
SOLANA_RPC_URL = "https://api.devnet.solana.com"
AI_TOKEN_MINT = "4pQaVgu9BdjTkms4pm2VqbTypqKB4URLHVKsakvqFeh4"
AI_PAYMENT_WALLET = "4d9WDb8dWs5FKCyQxMXAtiwDDsiqFitj6A3PEkz3mK8y"

logger.info("Loading models")
models = utils.load_models()

logger.info("Starting Flask app")
app = Flask(__name__)
CORS(app)
app.config["SOCK_SERVER_OPTIONS"] = {"ping_interval": 25}
sock = Sock(app)

logger.info("Pre-rendering index page")
index_html = views.render_index(app)
client = Client(SOLANA_RPC_URL)

@app.route('/pay', methods=['POST'])
async def pay():
    data = request.json
    sender = data['sender']
    token_count = data['token_count']

    sender_pubkey = PublicKey(sender)
    receiver_pubkey = PublicKey(AI_PAYMENT_WALLET)

    # Calculate the cost based on the number of tokens generated
    cost_per_token = 1 * 10 ** 6  # 1 token with 6 decimals
    total_cost = token_count * cost_per_token

    # Create the transaction to transfer the calculated amount of AIcrunch tokens
    transaction = Transaction()
    transaction.add(
        transfer(
            TransferParams(
                from_pubkey=sender_pubkey,
                to_pubkey=receiver_pubkey,
                lamports=total_cost
            )
        )
    )

    # Sign and send the transaction
    try:
        async with AsyncClient(SOLANA_RPC_URL) as client:
            response = await client.send_transaction(transaction, Keypair(sender), opts=TxOpts(skip_preflight=True, preflight_commitment=Confirmed))
            #, opts=TxOpts(skip_preflight=True, preflight_commitment=Confirmed)
            return jsonify({"status": "success", "signature": response['result']})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route("/")
def main_page():
    return index_html

import http_api
import websocket_api

if __name__ == '__main__':
    app.run(debug=True)

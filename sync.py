import ntplib
import os
import time

def sync_time():
    client = ntplib.NTPClient()
    response = client.request('pool.ntp.org')
    os.system(f'date {time.strftime("%m%d%H%M%Y.%S", time.localtime(response.tx_time))}')

sync_time()

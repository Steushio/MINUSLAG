import socket
import time
import threading
import sys

# Configuration
GAME_PORT = 5000           # Matches Valorant UDP range in MINUS LAG
SERVER_IP = "127.0.0.1"    # Local test
PACKET_COUNT = 50          # How many packets to send

# Statistics
packets_sent = 0
packets_received = 0
lock = threading.Lock()

def start_server():
    global packets_received
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((SERVER_IP, GAME_PORT))
    sock.settimeout(5.0)  # Stop listening after 5s of silence
    
    print(f"[Server] Listening on {SERVER_IP}:{GAME_PORT}...")
    
    start_time = time.time()
    try:
        while True:
            try:
                data, addr = sock.recvfrom(1024)
                with lock:
                    packets_received += 1
                # print(f"[Server] Received packet {packets_received} from {addr}")
            except socket.timeout:
                if packets_received > 0:
                    break
    except KeyboardInterrupt:
        pass
    finally:
        sock.close()
        print(f"[Server] Stopped. Total received: {packets_received}")

def start_client():
    global packets_sent
    time.sleep(1)  # Give server time to start
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    
    print(f"[Client] Sending {PACKET_COUNT} packets to {SERVER_IP}:{GAME_PORT}...")
    
    for i in range(PACKET_COUNT):
        msg = f"Packet {i}".encode()
        sock.sendto(msg, (SERVER_IP, GAME_PORT))
        with lock:
            packets_sent += 1
        time.sleep(0.05)  # 20 packets/sec (like a 20Hz tick rate)
        
    sock.close()
    print(f"[Client] Finished sending {packets_sent} packets.")

def main():
    server_thread = threading.Thread(target=start_server)
    client_thread = threading.Thread(target=start_client)
    
    server_thread.start()
    client_thread.start()
    
    client_thread.join()
    server_thread.join()
    
    print("-" * 40)
    print(f"Packets Sent:     {packets_sent}")
    print(f"Packets Received: {packets_received}")
    
    if packets_sent == 0:
        print("Error: No packets sent.")
        return

    ratio = packets_received / packets_sent
    print(f"Duplication Ratio: {ratio:.2f}x")
    
    if 0.9 <= ratio <= 1.1:
        print("Result: 1x (No Optimization / Passthrough)")
    elif 1.8 <= ratio <= 2.2:
        print("Result: 2x (Multipath Active! ✅ SUCCESS)")
    elif 2.7 <= ratio <= 3.3:
        print("Result: 3x (Multipath Max Active! ✅ SUCCESS)")
    else:
        print(f"Result: {ratio:.2f}x (Unexpected)")
    print("-" * 40)

if __name__ == "__main__":
    main()

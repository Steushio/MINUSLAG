import dgram from 'node:dgram';
import { Buffer } from 'node:buffer';

const GAME_PORT = 5000;
// Use an external IP so WinDivert sees it as "outbound" traffic
// Loopback (127.0.0.1) is often ignored by the kernel filter by default
const SERVER_IP = "8.8.8.8";
const PACKET_COUNT = 50;

async function runTest() {
    console.log("--- Starting Outbound Packet Test ---");
    console.log(`Sending ${PACKET_COUNT} packets to ${SERVER_IP}:${GAME_PORT}...`);
    console.log("PLEASE WATCH THE MINUS LAG DASHBOARD 'UDP PACKETS' COUNTER!");

    const client = dgram.createSocket('udp4');
    let packetsSent = 0;

    for (let i = 0; i < PACKET_COUNT; i++) {
        const message = Buffer.from(`Packet ${i}`);
        client.send(message, GAME_PORT, SERVER_IP, (err) => {
            if (err) console.error(err);
        });
        packetsSent++;
        // Send at ~20Hz (50ms delay)
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    client.close();
    console.log(`Finished sending ${packetsSent} packets.`);
    console.log("-".repeat(40));
    console.log("VERIFICATION:");
    console.log("Look at the MINUS LAG App for the 'UDP Packets' counter.");
    console.log(`You sent ${packetsSent} packets.`);
    console.log(`If Multipath (2x) works, the counter should have increased by ~${packetsSent * 2}!`);
    console.log(`(e.g. +100 packets, because each sent packet was duplicated)`);
    console.log("-".repeat(40));
}

runTest();

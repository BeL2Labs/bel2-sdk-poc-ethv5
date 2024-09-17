#!/usr/bin/env node

import { Command } from 'commander';
import { ZKP } from '@bel2labs/sdk';
import * as dotenv from 'dotenv';
import * as readlineSync from 'readline-sync';
import { ethers } from 'ethers';

dotenv.config();

const program = new Command();

function askForSubscription(): boolean {
    const answer = readlineSync.question('Do you want to subscribe to verification status updates? (y/n): ');
    return answer.toLowerCase() === 'y';
}

program
    .version('1.0.0')
    .description('A CLI tool for interacting with BeL2 SDK');

program
    .command('verify-transaction <txId>')
    .description('Verify a transaction')
    .action(async (txId: string) => {
        try {
            const rpcUrl = process.env.RPC_URL;
            const chainId = process.env.CHAIN_ID;
            const privateKey = process.env.PRIVATE_KEY;

            if (!chainId || !rpcUrl || !privateKey) {
                throw new Error('Missing environment variables');
            }

            const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

            const verification = await ZKP.EthersV5.TransactionVerification.create(txId, parseInt(chainId));

            if (!verification.isSubmitted()) {

                const wallet = new ethers.Wallet(privateKey, provider);
                const signer = provider.getSigner(wallet.address);

                const balance = await signer.getBalance();
                console.log("Account balance:", ethers.utils.formatEther(balance), "ELA");

                let network = await signer.provider?.getNetwork();
                console.log("Signer provider - Connected to network:", network?.name, "Chain ID:", network?.chainId);

                network = await provider.getNetwork();
                console.log("Signer provider - Connected to network:", network.name, "Chain ID:", network.chainId);

                try {
                    const response = await verification.submitVerificationRequest(signer);
                    console.log("Verification submitted:", response);
                } catch (err: any) {
                    console.error("Error details:", err);
                    if (err.transaction) {
                        console.error("Transaction details:", err.transaction);
                    }
                    if (err.receipt) {
                        console.error("Transaction receipt:", err.receipt);
                    }
                    throw err;
                }
            } else {
                console.log("Verification already submitted");
            }

            if (askForSubscription()) {
                verification.status$.subscribe((status) => {
                    console.log("New status:", status);
                });
                console.log("Subscribed to status updates. Waiting for updates...");
                console.log("You can exit at any moment by pressing Ctrl+C");
                // Keep the process running until the user terminates it
                process.stdin.resume();
            } else {
                // If the user doesn't want to subscribe, check the status once
                await verification.checkStatus();
                console.log("Current verification status:", verification.status$.getValue());
                process.exit(0);
            }

        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error:', error.message);
            } else {
                console.error('An unknown error occurred');
            }
            process.exit(1);
        }
    });

program.parse(process.argv);
import { ethers } from "ethers";

/**
 * Truncate a wallet address for display
 * @param address - Full wallet address
 * @param chars - Number of characters to show at start and end (default: 4)
 * @returns Truncated address string with ellipsis
 */
export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format a token amount from raw units to human-readable string
 * @param raw - Raw amount in smallest unit (wei for EVM, lamports for Solana)
 * @param decimals - Token decimals
 * @param maxDecimals - Maximum decimal places to display (default: 6)
 * @returns Formatted token amount string
 */
export function formatTokenAmount(
  raw: string | bigint,
  decimals: number,
  maxDecimals = 6,
): string {
  const formatted = ethers.formatUnits(raw, decimals);
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.000001) return "<0.000001";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * Parse a human-readable token amount to raw units
 * @param amount - Human-readable amount string (e.g., "1.5")
 * @param decimals - Token decimals
 * @returns Raw amount as bigint
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  return ethers.parseUnits(amount, decimals);
}

/**
 * Format a number as USD currency
 * @param amount - Number to format
 * @returns Formatted USD string (e.g., "$1,234.56")
 */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/**
 * Format a date as relative time ago
 * @param date - Date to format
 * @returns Relative time string (e.g., "5m ago", "2h ago")
 */
export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

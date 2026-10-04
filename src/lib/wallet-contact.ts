import { getPrivateKey, signWalletOwnership } from "@/lib/wallet-signer";
import { saveWalletContactFn } from "@/lib/wallet-contact.functions";

export async function saveWalletContact(address: string, phone: string, email: string) {
  const privateKey = getPrivateKey(address);
  if (!privateKey) throw new Error("Re-import your wallet to update contact details.");
  const detail = JSON.stringify({ phone, email });
  const signature = await signWalletOwnership(address, privateKey, "contact", detail);
  await saveWalletContactFn({ data: { wallet_address: address, phone, email, signature } });
}
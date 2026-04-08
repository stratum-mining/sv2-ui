export interface FaqItem {
  question: string;
  answer: string;
}

export const faqData: FaqItem[] = [
  {
    question: "Why am I getting a certificate error when connecting?",
    answer: "This usually happens when your computer's clock is off by more than 10 seconds. Since Docker containers use your computer's clock, if your system time is wrong, connections will fail.\n\nTo fix this:\n1. Make sure your computer's clock is set to sync automatically (usually via NTP in your system settings)\n2. If you use Docker Desktop, try restarting it, this often fixes time sync issues, especially after your computer has been sleeping\n3. Restart your computer if the issue persists"
  },
  {
    question: "Why is my miner not submitting any shares?",
    answer: "This is usually related to the initial difficulty setting. When you first connect, the system doesn't know how fast your miner is, so it starts with an estimated difficulty that might be too high for your miner to find shares.\n\nDon't worry, the system will automatically adjust. Once it notices your miner isn't finding shares, it will lower the difficulty so your miner can start submitting shares. This is called 'variable difficulty' and it's normal.\n\nIf your miner still isn't submitting shares after a few minutes, check that your miner is properly connected and configured."
  }
];

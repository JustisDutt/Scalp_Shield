import type { AppProps } from "next/app";
import Head from "next/head";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>ScalpShield | Suspicious ticket purchase detection</title>
        <meta
          name="description"
          content="ScalpShield is a local demo SaaS that uses a pretrained XGBoost model to flag suspicious and high risk ticket purchases from CSV data."
        />
        <link rel="icon" href="/favicon.png" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}

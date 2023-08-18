/**
  * yorkie-js-sdk must be loaded on client-side
*/
"use client";

import styles from "./styles/page.module.css";
import React, { useEffect, useState } from "react";

import { ContentTypes, ENVtypes } from "./utils/types";
import { displayPeers, createRandomPeers } from "./utils/handlePeers";
import { parseDate } from "./utils/parseDate";
import yorkie, { Document, JSONArray } from "yorkie-js-sdk";
import Sceduler from "./Sceduler";

// parseDate() value's format = "DD-MM-YYYY"
const defaultContent: JSONArray<ContentTypes> = [
  {
    date: parseDate(new Date()).replace(/^\d{2}/, "01"),
    text: "payday",
  },
  {
    date: parseDate(new Date()).replace(/^\d{2}/, "17"),
    text: "Garry's birthday",
  },
];

const ENV: ENVtypes = {
  url: process.env.NEXT_PUBLIC_YORKIE_API_ADDR!,
  apiKey: process.env.NEXT_PUBLIC_YORKIE_API_KEY!,
};

const DOCUMENT_KEY = `next.js-Sceduler-${parseDate(new Date())}`;

/**
  * main page
*/
export default function Editor() {
  const [peers, setPeers] = useState<string[]>([]);
  const [content, setContent] = useState<Array<ContentTypes>>(defaultContent);

  // create Yorkie Document with useState value
  const [doc] = useState<Document<{ content: JSONArray<ContentTypes> }>>(
    () =>
      new yorkie.Document<{ content: JSONArray<ContentTypes> }>(DOCUMENT_KEY),
  );

  const actions = {
    // push new content to Yorkie's database
    addContent(date: string, text: string) {
      doc.update(root => {
        root.content.push({ date, text });
      });
    },

    // delete selected content at Yorkie's database
    deleteContent(date: string) {
      doc.update(root => {
        let target;
        for (const item of root.content) {
          if (item.date === date) {
            target = item as any;
            break;
          }
        }

        if (target) {
          root.content.deleteByID!(target.getID());
        }
      });
    },

    // edit selected content at Yorkie's database
    updateContent(date: string, text: string) {
      doc.update(root => {
        let target;
        for (const item of root.content) {
          if (item.date === date) {
            target = item;
            break;
          }
        }

        if (target) {
          target.text = text;
        }
      });
    },
  };

  useEffect(() => {
    // create Yorkie Client at client-side
    const client = new yorkie.Client(ENV.url, {
      apiKey: ENV.apiKey,
      presence: {
        userName: createRandomPeers(),
      },
    });

    // subscribe client event "peers-changed"
    client.subscribe(event => {
      if (event.type === "peers-changed") {
        setPeers(displayPeers(client.getPeersByDocKey(doc.getKey())));
      }
    });

    /*
      `attachDoc` is a helper function to attach the document into the client.
     */
    async function attachDoc(
      doc: Document<{ content: JSONArray<ContentTypes> }>,
      callback: (props: any) => void,
    ) {
      // 01. activate client
      await client.activate();
      // 02. attach the document into the client
      await client.attach(doc);

      // 03. create default content if not exists.
      doc.update(root => {
        if (!root.content) {
          root.content = defaultContent;
        }
      }, "create default content if not exists");

      // 04. subscribe doc's change event from local and remote.
      doc.subscribe(event => {
        callback(doc.getRoot().content);
      });

      // 05. set content to the attached document.
      callback(doc.getRoot().content);
    }

    attachDoc(doc, content => setContent(content));
  }, []);

  return (
    <main className={styles.main}>
      <p>
        peers : [
        {peers.map((man: string, i: number) => {
          return <span key={i}> {man}, </span>;
        })}{" "}
        ]
      </p>
      <Sceduler content={content} actions={actions} />
    </main>
  );
}

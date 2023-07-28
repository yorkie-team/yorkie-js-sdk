import { useEffect, useRef, useState } from 'react'
import "./App.css"

import yorkie from 'yorkie-js-sdk';






const client = new yorkie.Client('https://api.yorkie.dev', {
  apiKey: 'cinr4o2bjhd62lidlji0',
  presence: {
    name: "",
    color: "",
  },
});  

const doc = new yorkie.Document('test2'); // some work some don't


const App = () => {

    const [currClient, setCurrClient] = useState();
    const [clients, setClients] = useState([]);



  useEffect(() => {




    const setup = async () => {    

      await client.activate();

      client.subscribe((event) => {

        console.log("client event ---------- ", event.type)

        if (event.type === 'peers-changed') {

          setClients(client.getPeersByDocKey(doc.getKey()))

          const getCommonValuesByProperty = (array1, array2, property) => {
            return array1.filter((item1) => array2.some((item2) => item2[property] === item1[property]));
          }

          doc.update((root) => {
            root.users = getCommonValuesByProperty(root.users, client.getPeersByDocKey(doc.getKey()), 'clientID');
          });

        }

        if (event.type === "documents-changed") {
          doc.update((root) => {
            setOtherClients(root.users)
          });
        }

      });


      
      setCurrClient(client.getID());



      await client.attach(doc);




      doc.subscribe((event) => {

        console.log("doc event ---------- ", event.type)
        
        if (event.type === 'remote-change') {
          doc.update((root) => {
            setOtherClients(root.users)
          });
        }
      })
    




      doc.update((root) => {
        root.users = []
      });


      window.addEventListener('beforeunload', () => {
        client.deactivate();
      });

    }



    setup();



    

  }, []);



    return (  
        <div>
             {clients.length} <p> ---------------------</p>
        </div>
    );
}
 
export default App;
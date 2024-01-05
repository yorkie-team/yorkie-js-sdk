import { createRoot } from "react-dom/client"

const Panel = () => {
  return (
    <>
      <h2>Yorkie Panel</h2>
    </>
  )
}

const root = createRoot(document.getElementById("root"))
root.render(<Panel />)

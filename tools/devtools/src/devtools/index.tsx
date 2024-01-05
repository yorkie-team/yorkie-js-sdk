import yorkiePanelHTML from "url:./panel/index.html"

chrome.devtools.panels.create(
  "🐶 Yorkie",
  "",
  // See: https://github.com/PlasmoHQ/plasmo/issues/106#issuecomment-1188539625
  yorkiePanelHTML.split("/").pop()
)

function Page() {
  return null
}

export default Page

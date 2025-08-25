// 기본 규칙
const DEFAULT_RULES = [
  {
    name: "Entertainment",
    pattern: "(youtube|netflix|twitch)\\.",
    color: "yellow",
  },
  { name: "News", pattern: "(news|bbc|cnn|hankyung)\\.", color: "blue" },
  { name: "Work", pattern: "(github|jira|notion)\\.", color: "green" },
];

// 저장된 규칙 불러오기
async function getRules() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["rules"], (res) => {
      resolve(res.rules || DEFAULT_RULES);
    });
  });
}

// 탭 자동 분류
async function classifyTab(tab) {
  const rules = await getRules();
  const url = tab.url || "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  for (const r of rules) {
    const re = new RegExp(r.pattern, "i");
    if (re.test(host) || re.test(url))
      return { category: r.name, color: r.color || "grey" };
  }
  return { category: "Others", color: "grey" };
}

// 메시지 처리
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === "GET_TABS") {
        const tabs = await chrome.tabs.query({});
        const categorizedTabs = [];
        for (const t of tabs) {
          const { category } = await classifyTab(t);
          categorizedTabs.push({
            id: t.id,
            url: t.url,
            title: t.title,
            category,
          });
        }
        sendResponse({ tabs: categorizedTabs });
      }

      if (message.type === "CLOSE_DUPLICATES") {
        const tabs = await chrome.tabs.query({});
        const seen = new Set();
        for (const t of tabs) {
          if (seen.has(t.url)) chrome.tabs.remove(t.id);
          else seen.add(t.url);
        }
        sendResponse({ success: true });
      }

      if (message.type === "OPEN_SESSION") {
        const session = message.session;
        if (session && session.tabs) {
          for (const t of session.tabs) chrome.tabs.create({ url: t.url });
        }
        sendResponse({ success: true });
      }
    } catch (e) {
      console.error(e);
      sendResponse({ success: false, error: e.message });
    }
  })();
  return true;
});

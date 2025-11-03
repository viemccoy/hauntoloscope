import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { generateArticle, generateInterpolations, generateTimeline } from "./lib/groq";
import { useLocalStorage } from "./hooks/useLocalStorage";
function formatError(error) {
    if (error instanceof Error)
        return error.message;
    return String(error);
}
function parseAnchorDate(raw) {
    if (!raw)
        return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed;
}
function formatDisplayDate(raw) {
    if (!raw)
        return "";
    const parsed = parseAnchorDate(raw);
    if (!parsed)
        return raw;
    return parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}
function deriveTimelineBounds(entries) {
    const dates = entries
        .map((entry) => parseAnchorDate(entry.anchorDate))
        .filter((value) => Boolean(value))
        .sort((a, b) => a.getTime() - b.getTime());
    if (dates.length === 0) {
        return null;
    }
    return {
        start: dates[0],
        end: dates[dates.length - 1]
    };
}
function formatBoundsRange(bounds) {
    const formatter = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short" });
    const startLabel = formatter.format(bounds.start);
    const endLabel = formatter.format(bounds.end);
    if (startLabel === endLabel) {
        return startLabel;
    }
    return `${startLabel} → ${endLabel}`;
}
const GUIDING_PRINCIPLE_FILTERS = [
    /counterfactual step institutionally and economically traceable/i,
    /simulation fidelity/i,
    /uncanny anomaly per entry/i,
    /priority stack/i,
    /respond with json only/i,
    /score\s*≥/i,
    /negating the/i,
    /simulate/i,
    /assume the/i,
    /allowing only/i,
    /^by\s+/i,
    /minimum institutional/i
];
function sanitizeGuidingPrinciple(raw) {
    if (!raw)
        return null;
    const segments = raw
        .split(/\s*\n+\s*|(?<=[.?!])\s+/)
        .map((segment) => segment.trim())
        .filter(Boolean)
        .filter((segment) => !GUIDING_PRINCIPLE_FILTERS.some((pattern) => pattern.test(segment.toLowerCase())))
        .filter((segment) => segment.length > 8);
    if (segments.length === 0)
        return null;
    const joined = segments.join(" ");
    if (/simulate|negating|score|priority|minimum institutional/i.test(joined)) {
        return null;
    }
    return joined;
}
function createSeedSummary(seedEvent, timeline) {
    const normalizedSeed = seedEvent.trim().replace(/\s+/g, " ");
    const base = normalizedSeed || "Unspecified Counterfactual";
    const headline = timeline.timeline_title?.trim() ?? "";
    const firstEntry = timeline.entries[0];
    const anchor = firstEntry?.anchorDate || firstEntry?.era || "";
    const parts = [base, headline, anchor].filter(Boolean);
    return parts.join(" • ").toUpperCase();
}
const ARTICLE_MARKDOWN_COMPONENTS = {
    h2: ({ node, ...props }) => (_jsx("h3", { style: {
            fontSize: "1.6rem",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            margin: "1.5rem 0 0.75rem"
        }, ...props })),
    h3: ({ node, ...props }) => (_jsx("h4", { style: {
            fontSize: "1.3rem",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            margin: "1.2rem 0 0.6rem"
        }, ...props })),
    p: ({ node, ...props }) => (_jsx("p", { style: {
            margin: "0 0 1rem",
            lineHeight: 1.7,
            opacity: 0.95
        }, ...props })),
    strong: ({ node, ...props }) => (_jsx("strong", { style: {
            fontWeight: 600,
            letterSpacing: "0.02em"
        }, ...props })),
    em: ({ node, ...props }) => (_jsx("em", { style: {
            fontStyle: "italic"
        }, ...props })),
    ul: ({ node, ...props }) => (_jsx("ul", { style: {
            paddingLeft: "1.5rem",
            margin: "0 0 1rem",
            lineHeight: 1.6
        }, ...props })),
    ol: ({ node, ...props }) => (_jsx("ol", { style: {
            paddingLeft: "1.5rem",
            margin: "0 0 1rem",
            lineHeight: 1.6
        }, ...props })),
    li: ({ node, ...props }) => (_jsx("li", { style: {
            marginBottom: "0.35rem"
        }, ...props })),
    blockquote: ({ node, ...props }) => (_jsx("blockquote", { style: {
            borderLeft: "3px solid rgba(245,241,230,0.25)",
            margin: "1.5rem 0",
            padding: "0.75rem 1rem",
            fontStyle: "italic",
            background: "rgba(50, 40, 70, 0.25)"
        }, ...props }))
};
const LEDE_MARKDOWN_COMPONENTS = {
    ...ARTICLE_MARKDOWN_COMPONENTS,
    p: ({ node, ...props }) => (_jsx("p", { style: {
            margin: "0 0 1rem",
            lineHeight: 1.7,
            fontWeight: 600,
            fontSize: "1.05rem",
            letterSpacing: "0.01em"
        }, ...props }))
};
export default function App() {
    const [apiKey, setApiKey] = useLocalStorage("hauntoloscope.apiKey", "");
    const [seedEvent, setSeedEvent] = useState("");
    const [timeline, setTimeline] = useState(null);
    const [articles, setArticles] = useState({});
    const [seedSummary, setSeedSummary] = useState("");
    const [interpolationStatus, setInterpolationStatus] = useState({});
    const [interpolationErrors, setInterpolationErrors] = useState({});
    const [activeEntryId, setActiveEntryId] = useState(null);
    const [isGeneratingTimeline, setIsGeneratingTimeline] = useState(false);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);
    const mainContentRef = useRef(null);
    const handleGenerateTimeline = useCallback(async () => {
        if (!apiKey) {
            setError("Provide your Groq API key first.");
            return;
        }
        if (!seedEvent.trim()) {
            setError("Whisper an event from the past before invoking the scope.");
            return;
        }
        try {
            setError(null);
            setIsGeneratingTimeline(true);
            setActiveEntryId(null);
            setArticles({});
            setInterpolationStatus({});
            setInterpolationErrors({});
            const response = await generateTimeline(apiKey, seedEvent.trim());
            setTimeline(response);
            setSeedSummary(createSeedSummary(seedEvent, response));
        }
        catch (err) {
            setError(formatError(err));
        }
        finally {
            setIsGeneratingTimeline(false);
        }
    }, [apiKey, seedEvent]);
    const handleSelectEntry = useCallback(async (entry) => {
        setActiveEntryId(entry.id);
        if (!apiKey || !timeline) {
            return;
        }
        const current = articles[entry.id];
        if (current?.status === "loading" || current?.status === "ready") {
            return;
        }
        setArticles((prev) => ({
            ...prev,
            [entry.id]: { status: "loading" }
        }));
        try {
            const article = await generateArticle(apiKey, seedEvent, entry, timeline);
            setArticles((prev) => ({
                ...prev,
                [entry.id]: { status: "ready", data: article }
            }));
        }
        catch (err) {
            setArticles((prev) => ({
                ...prev,
                [entry.id]: { status: "error", error: formatError(err) }
            }));
        }
    }, [apiKey, articles, seedEvent, timeline]);
    const handleInterpolations = useCallback(async (entry) => {
        if (!timeline || !apiKey)
            return;
        setInterpolationErrors((prev) => ({ ...prev, [entry.id]: null }));
        setInterpolationStatus((prev) => ({ ...prev, [entry.id]: "loading" }));
        const entries = timeline.entries;
        const index = entries.findIndex((item) => item.id === entry.id);
        const previous = index > 0 ? entries[index - 1] : undefined;
        const next = index >= 0 && index < entries.length - 1 ? entries[index + 1] : undefined;
        try {
            const { entries: additions } = await generateInterpolations(apiKey, seedEvent, {
                previous,
                current: entry,
                next,
                timeline
            });
            if (!additions?.length)
                return;
            const newEntries = [...entries];
            const insertIndex = index >= 0 ? index + 1 : newEntries.length;
            additions.forEach((addition, offset) => {
                if (newEntries.some((existing) => existing.id === addition.id)) {
                    return;
                }
                newEntries.splice(insertIndex + offset, 0, addition);
            });
            setTimeline({ ...timeline, entries: newEntries });
        }
        catch (err) {
            const message = formatError(err);
            setInterpolationErrors((prev) => ({ ...prev, [entry.id]: message }));
            setError(message);
        }
        finally {
            setInterpolationStatus((prev) => ({ ...prev, [entry.id]: "idle" }));
        }
    }, [apiKey, seedEvent, timeline]);
    const handleExport = useCallback(() => {
        if (!timeline)
            return;
        const bundle = {
            seed_event: seedEvent,
            seed_summary: seedSummary,
            generated_at: new Date().toISOString(),
            timeline,
            articles: Object.fromEntries(Object.entries(articles)
                .filter(([, value]) => value.status === "ready" && value.data)
                .map(([key, value]) => [key, value.data]))
        };
        const blob = new Blob([JSON.stringify(bundle, null, 2)], {
            type: "application/json"
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `hauntoloscope-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [articles, seedEvent, timeline]);
    const handleImport = useCallback(async (file) => {
        try {
            const text = await file.text();
            const bundle = JSON.parse(text);
            setSeedEvent(bundle.seed_event);
            setTimeline(bundle.timeline);
            setArticles(Object.fromEntries(Object.entries(bundle.articles || {}).map(([key, value]) => [
                key,
                { status: "ready", data: value }
            ])));
            if (bundle.seed_summary) {
                setSeedSummary(bundle.seed_summary);
            }
            else {
                setSeedSummary(createSeedSummary(bundle.seed_event, bundle.timeline));
            }
            setInterpolationStatus({});
            setInterpolationErrors({});
            setActiveEntryId(null);
            setError(null);
        }
        catch (err) {
            setError(`Failed to import bundle: ${formatError(err)}`);
        }
    }, []);
    const timelineEntries = useMemo(() => timeline?.entries ?? [], [timeline]);
    const threadsCatalogue = useMemo(() => {
        const registry = new Set();
        timelineEntries.forEach((entry) => entry.threads?.forEach((thread) => registry.add(thread)));
        return Array.from(registry);
    }, [timelineEntries]);
    const timelineBounds = useMemo(() => (timelineEntries.length ? deriveTimelineBounds(timelineEntries) : null), [timelineEntries]);
    const guidingPrinciple = useMemo(() => {
        if (!timeline)
            return null;
        const cleaned = sanitizeGuidingPrinciple(timeline.guiding_principle);
        if (cleaned)
            return cleaned;
        const firstSummary = timeline.entries?.[0]?.summary?.trim();
        return firstSummary || null;
    }, [timeline]);
    useEffect(() => {
        if (mainContentRef.current) {
            mainContentRef.current.scrollTo({ top: 0, behavior: "smooth" });
        }
    }, [activeEntryId, timeline]);
    const activeEntry = useMemo(() => {
        if (!timeline)
            return null;
        return (timeline.entries.find((item) => item.id === activeEntryId) ??
            timeline.entries[0] ??
            null);
    }, [timeline, activeEntryId]);
    const activeArticleState = activeEntryId ? articles[activeEntryId] : undefined;
    return (_jsxs("div", { style: {
            display: "grid",
            gridTemplateColumns: "420px 1fr",
            minHeight: "100vh",
            backdropFilter: "blur(8px)",
            backgroundColor: "rgba(5, 5, 9, 0.92)"
        }, children: [_jsxs("aside", { style: {
                    borderRight: "1px solid rgba(245,241,230,0.1)",
                    padding: "2rem 1.75rem",
                    overflowY: "auto",
                    height: "100vh"
                }, children: [_jsxs("header", { style: { marginBottom: "2rem" }, children: [_jsx("h1", { style: { fontSize: "2.5rem", textTransform: "uppercase" }, children: "HAUNTOLOSCOPE" }), _jsxs("div", { style: {
                                    marginTop: "1rem",
                                    fontSize: "0.85rem",
                                    lineHeight: 1.6,
                                    opacity: 0.8,
                                    maxWidth: "24rem"
                                }, children: [_jsxs("div", { children: [_jsx("strong", { style: { letterSpacing: "0.08em" }, children: "hauntology (noun):" }), " the study of how unresolved pasts linger within the present, refusing to fully vanish even as new futures emerge."] }), _jsxs("div", { style: { marginTop: "0.6rem" }, children: [_jsx("strong", { style: { letterSpacing: "0.08em" }, children: "hauntoloscope (noun):" }), " an instrument for surveying counterfactual timelines, mapping the downstream headlines from a single altered event."] })] })] }), _jsxs("section", { style: { marginBottom: "2rem" }, children: [_jsx("label", { htmlFor: "apiKey", style: { display: "block", fontSize: "0.85rem", letterSpacing: "0.08em", opacity: 0.8 }, children: "Groq API Key" }), _jsx("input", { id: "apiKey", type: "password", placeholder: "gsk_...", value: apiKey, onChange: (event) => setApiKey(event.target.value), autoComplete: "off", style: { marginTop: "0.5rem" } })] }), _jsxs("section", { style: { marginBottom: "1.5rem" }, children: [_jsx("label", { htmlFor: "seedEvent", style: { display: "block", fontSize: "0.85rem", letterSpacing: "0.08em", opacity: 0.8 }, children: "Seed Event" }), _jsx("textarea", { id: "seedEvent", rows: 5, value: seedEvent, onChange: (event) => setSeedEvent(event.target.value), onKeyDown: (event) => {
                                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                        event.preventDefault();
                                        handleGenerateTimeline();
                                    }
                                }, placeholder: "Describe the moment you wish to disturb...", style: { marginTop: "0.5rem", resize: "vertical" } }), _jsx("button", { onClick: handleGenerateTimeline, style: {
                                    marginTop: "0.75rem",
                                    width: "100%",
                                    padding: "0.75rem",
                                    fontFamily: "'Cormorant Garamond', 'Spectral', serif",
                                    letterSpacing: "0.12em",
                                    fontSize: "1.1rem",
                                    textTransform: "uppercase"
                                }, disabled: isGeneratingTimeline, children: isGeneratingTimeline ? "Scrying..." : "Bend the Axis" })] }), error && (_jsx("div", { role: "alert", style: {
                            border: "1px solid rgba(220,90,90,0.6)",
                            padding: "0.75rem",
                            background: "rgba(60,10,10,0.35)",
                            color: "#f7dede",
                            fontSize: "0.9rem",
                            marginBottom: "1.5rem"
                        }, children: error })), _jsxs("section", { style: { marginBottom: "1.5rem" }, children: [_jsxs("div", { style: {
                                    display: "flex",
                                    gap: "0.75rem",
                                    marginBottom: "0.5rem",
                                    justifyContent: "center",
                                    flexWrap: "wrap"
                                }, children: [_jsx("button", { onClick: handleExport, disabled: !timeline, style: { borderWidth: "2px" }, children: "Export Relic" }), _jsx("button", { onClick: () => fileInputRef.current?.click(), style: { borderWidth: "2px" }, children: "Import Relic" })] }), _jsx("input", { type: "file", accept: "application/json", ref: fileInputRef, style: { display: "none" }, onChange: (event) => {
                                    const file = event.target.files?.[0];
                                    if (file)
                                        handleImport(file);
                                    event.target.value = "";
                                } })] }), _jsxs("section", { children: [_jsx("h2", { style: {
                                    fontSize: "1.2rem",
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    marginBottom: "0.5rem"
                                }, children: "Timeline Desk" }), timelineEntries.length === 0 ? (_jsx("div", { style: { opacity: 0.6 }, children: "No echoes inscribed yet." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                            border: "1px solid rgba(245,241,230,0.15)",
                                            padding: "1rem",
                                            background: "rgba(10, 10, 14, 0.62)",
                                            marginBottom: "1rem",
                                            display: "grid",
                                            gap: "0.75rem"
                                        }, children: [_jsx("div", { style: {
                                                    fontSize: "0.75rem",
                                                    letterSpacing: "0.12em",
                                                    textTransform: "uppercase",
                                                    opacity: 0.7
                                                }, children: "Desk Briefing" }), _jsxs("div", { style: {
                                                    display: "flex",
                                                    flexWrap: "wrap",
                                                    gap: "0.5rem",
                                                    justifyContent: "space-between",
                                                    fontSize: "0.95rem",
                                                    opacity: 0.85
                                                }, children: [_jsxs("span", { children: [timelineEntries.length, " recorded", " ", timelineEntries.length === 1 ? "event" : "events"] }), timelineBounds ? _jsxs("span", { children: ["Span ", formatBoundsRange(timelineBounds)] }) : null] }), threadsCatalogue.length > 0 && (_jsxs("div", { children: [_jsx("div", { style: {
                                                            fontSize: "0.75rem",
                                                            letterSpacing: "0.12em",
                                                            textTransform: "uppercase",
                                                            opacity: 0.7,
                                                            marginBottom: "0.35rem"
                                                        }, children: "Threads" }), _jsx("div", { style: {
                                                            display: "flex",
                                                            flexWrap: "wrap",
                                                            gap: "0.35rem"
                                                        }, children: threadsCatalogue.map((thread) => (_jsx("span", { style: {
                                                                border: "1px solid rgba(245,241,230,0.2)",
                                                                padding: "0.2rem 0.45rem",
                                                                fontSize: "0.7rem",
                                                                letterSpacing: "0.08em"
                                                            }, children: thread }, thread))) })] }))] }), _jsx("ol", { style: {
                                            listStyle: "none",
                                            padding: 0,
                                            margin: 0,
                                            display: "grid",
                                            gap: "1.25rem"
                                        }, children: timelineEntries.map((entry, index) => {
                                            const isActive = entry.id === activeEntryId;
                                            const articleState = articles[entry.id];
                                            const displayDate = formatDisplayDate(entry.anchorDate);
                                            const ordinal = String(index + 1).padStart(2, "0");
                                            const isInterpolating = interpolationStatus[entry.id] === "loading";
                                            const interpolationError = interpolationErrors[entry.id] ?? null;
                                            let statusLabel = "Awaiting inscription";
                                            let statusColor = "rgba(245,241,230,0.6)";
                                            if (isInterpolating) {
                                                statusLabel = "Extending interval…";
                                                statusColor = "rgba(190,150,255,0.85)";
                                            }
                                            else if (articleState?.status === "loading") {
                                                statusLabel = "Scribing in progress…";
                                                statusColor = "rgba(190,150,255,0.85)";
                                            }
                                            else if (articleState?.status === "ready") {
                                                statusLabel = "Broadsheet archived";
                                                statusColor = "rgba(170,220,200,0.9)";
                                            }
                                            if (articleState?.status === "error") {
                                                statusLabel = "Scribing failed — retry";
                                                statusColor = "rgba(255,160,160,0.9)";
                                            }
                                            if (interpolationError) {
                                                statusLabel = "Interval expansion failed — retry";
                                                statusColor = "rgba(255,160,160,0.9)";
                                            }
                                            const openButtonLabel = articleState?.status === "ready" ? "Open Chronicle" : "Summon Chronicle";
                                            const generateButtonLabel = isInterpolating ? "Weaving…" : "Generate More Events";
                                            return (_jsx("li", { style: { listStyle: "none" }, children: _jsxs("div", { style: {
                                                        display: "grid",
                                                        gridTemplateColumns: "minmax(56px, 68px) 1fr",
                                                        alignItems: "stretch",
                                                        gap: "1rem"
                                                    }, children: [_jsxs("div", { style: {
                                                                position: "relative",
                                                                display: "flex",
                                                                flexDirection: "column",
                                                                alignItems: "center",
                                                                justifyContent: "space-between",
                                                                padding: "1.4rem 0",
                                                                textTransform: "uppercase",
                                                                letterSpacing: "0.12em",
                                                                fontSize: "0.6rem",
                                                                color: "rgba(245,241,230,0.68)"
                                                            }, children: [_jsx("div", { style: {
                                                                        position: "absolute",
                                                                        top: "0.4rem",
                                                                        bottom: "0.4rem",
                                                                        width: "1px",
                                                                        background: "linear-gradient(180deg, rgba(245,241,230,0), rgba(245,241,230,0.45), rgba(245,241,230,0))",
                                                                        left: "50%",
                                                                        transform: "translateX(-50%)"
                                                                    } }), _jsx("span", { style: {
                                                                        background: "rgba(10,10,14,0.85)",
                                                                        padding: "0 0.4rem",
                                                                        zIndex: 1
                                                                    }, children: "Interval" }), _jsxs("span", { style: {
                                                                        fontFamily: "monospace",
                                                                        fontSize: "0.85rem",
                                                                        letterSpacing: "0.04em",
                                                                        textTransform: "none",
                                                                        background: "rgba(10,10,14,0.9)",
                                                                        padding: "0.25rem 0.6rem",
                                                                        borderRadius: "999px",
                                                                        border: "1px solid rgba(245,241,230,0.25)",
                                                                        color: "rgba(245,241,230,0.85)",
                                                                        zIndex: 1
                                                                    }, children: ["#", ordinal] }), _jsx("span", { style: {
                                                                        width: "8px",
                                                                        height: "8px",
                                                                        borderRadius: "50%",
                                                                        background: isActive
                                                                            ? "rgba(190,150,255,0.9)"
                                                                            : "rgba(245,241,230,0.75)",
                                                                        boxShadow: isActive
                                                                            ? "0 0 8px rgba(190,150,255,0.7)"
                                                                            : "0 0 6px rgba(245,241,230,0.35)",
                                                                        zIndex: 1
                                                                    } })] }), _jsxs("div", { style: {
                                                                border: `1px solid ${isActive ? "rgba(190,150,255,0.7)" : "rgba(245,241,230,0.2)"}`,
                                                                background: isActive ? "rgba(40, 15, 60, 0.5)" : "rgba(10, 10, 14, 0.55)",
                                                                padding: "1.2rem 1.4rem",
                                                                display: "grid",
                                                                gap: "0.85rem",
                                                                transition: "border-color 0.2s ease"
                                                            }, children: [_jsx("div", { style: {
                                                                        display: "flex",
                                                                        justifyContent: "space-between",
                                                                        alignItems: "flex-start",
                                                                        flexWrap: "wrap",
                                                                        gap: "0.5rem"
                                                                    }, children: _jsxs("div", { style: {
                                                                            display: "flex",
                                                                            flexWrap: "wrap",
                                                                            gap: "0.5rem",
                                                                            fontSize: "0.85rem",
                                                                            letterSpacing: "0.08em",
                                                                            opacity: 0.75,
                                                                            textTransform: "uppercase"
                                                                        }, children: [_jsx("span", { children: entry.era || "Untethered era" }), displayDate && _jsx("span", { children: displayDate })] }) }), _jsx("div", { style: { fontSize: "1.1rem", fontWeight: 600 }, children: entry.title }), _jsx("p", { style: { margin: 0, lineHeight: 1.6, opacity: 0.9 }, children: entry.summary }), entry.threads && entry.threads.length > 0 && (_jsx("div", { style: {
                                                                        display: "flex",
                                                                        flexWrap: "wrap",
                                                                        gap: "0.35rem"
                                                                    }, children: entry.threads.map((thread) => (_jsx("span", { style: {
                                                                            border: "1px solid rgba(245,241,230,0.2)",
                                                                            padding: "0.2rem 0.45rem",
                                                                            fontSize: "0.7rem",
                                                                            letterSpacing: "0.08em"
                                                                        }, children: thread }, thread))) })), _jsxs("div", { style: {
                                                                        display: "flex",
                                                                        justifyContent: "space-between",
                                                                        alignItems: "center",
                                                                        flexWrap: "wrap",
                                                                        gap: "0.75rem"
                                                                    }, children: [_jsx("span", { style: { fontSize: "0.85rem", color: statusColor }, children: statusLabel }), _jsxs("div", { style: {
                                                                                display: "flex",
                                                                                gap: "0.65rem",
                                                                                flexWrap: "wrap",
                                                                                justifyContent: "flex-end"
                                                                            }, children: [_jsx("button", { onClick: () => handleInterpolations(entry), disabled: isInterpolating, style: {
                                                                                        borderWidth: "2px",
                                                                                        padding: "0.65rem 1.2rem",
                                                                                        minWidth: "12rem",
                                                                                        justifyContent: "center"
                                                                                    }, className: "generate-more-events", children: generateButtonLabel }), _jsx("button", { onClick: () => handleSelectEntry(entry), disabled: articleState?.status === "loading", style: {
                                                                                        borderWidth: "2px",
                                                                                        padding: "0.65rem 1.2rem",
                                                                                        minWidth: "12rem",
                                                                                        justifyContent: "center"
                                                                                    }, className: "primary-action", children: openButtonLabel })] })] }), interpolationError && (_jsx("div", { style: {
                                                                        border: "1px solid rgba(255,160,160,0.4)",
                                                                        padding: "0.5rem 0.75rem",
                                                                        fontSize: "0.8rem",
                                                                        color: "rgba(255,200,200,0.9)",
                                                                        background: "rgba(60,10,10,0.35)"
                                                                    }, children: interpolationError })), articleState?.status === "error" && articleState.error && (_jsx("div", { style: {
                                                                        border: "1px solid rgba(255,160,160,0.4)",
                                                                        padding: "0.5rem 0.75rem",
                                                                        fontSize: "0.8rem",
                                                                        color: "rgba(255,200,200,0.9)",
                                                                        background: "rgba(60,10,10,0.35)"
                                                                    }, children: articleState.error }))] })] }) }, entry.id));
                                        }) })] }))] })] }), _jsx("main", { ref: mainContentRef, style: {
                    padding: "2rem 3rem",
                    overflowY: "auto",
                    height: "100vh"
                }, children: _jsxs("div", { style: {
                        width: "min(100%, 900px)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2.5rem",
                        alignItems: "flex-start"
                    }, children: [_jsxs("section", { style: {
                                width: "100%",
                                padding: "1.8rem 2rem",
                                position: "relative",
                                overflow: "hidden",
                                background: "radial-gradient(circle at top, rgba(190,150,255,0.18), transparent 60%), rgba(10,10,14,0.5)",
                                borderLeft: "3px solid rgba(190,150,255,0.35)",
                                boxShadow: "0 0 35px rgba(40, 20, 70, 0.35)",
                                display: "grid",
                                gap: "1.1rem"
                            }, children: [_jsx("div", { style: {
                                        position: "absolute",
                                        inset: 0,
                                        pointerEvents: "none",
                                        background: "repeating-linear-gradient(45deg, rgba(245,241,230,0.04), rgba(245,241,230,0.04) 2px, transparent 2px, transparent 6px)"
                                    } }), _jsxs("div", { style: { position: "relative", zIndex: 1 }, children: [_jsx("h2", { style: {
                                                fontSize: timeline ? "1.6rem" : "1.4rem",
                                                letterSpacing: "0.12em",
                                                textTransform: "uppercase",
                                                margin: 0,
                                                opacity: 0.85
                                            }, children: timeline ? `Dossier: ${timeline.timeline_title}` : "Continuity Orientation Memo" }), _jsx("p", { style: { marginTop: "0.9rem", maxWidth: "60ch", lineHeight: 1.8, opacity: 0.92 }, children: timeline
                                                ? guidingPrinciple ||
                                                    "A chronology presented by the counterfactual bureau with all institutional records cross-referenced for consistency."
                                                : "HAUNTOLOSCOPE assembles documentary traces from timelines that never quite were. Submit an event that happened to see what unfolds if it never did—or describe the turning point you wish existed and watch the bureau trace its consequences." })] }), timeline && (_jsxs("div", { style: {
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: "1.2rem",
                                        letterSpacing: "0.05em",
                                        fontSize: "0.85rem",
                                        textTransform: "uppercase",
                                        position: "relative",
                                        zIndex: 1
                                    }, children: [_jsxs("span", { style: { opacity: 0.75 }, children: ["Entries: ", timelineEntries.length] }), timelineBounds && (_jsxs("span", { style: { opacity: 0.75 }, children: ["Span: ", formatBoundsRange(timelineBounds)] })), seedSummary && _jsxs("span", { style: { opacity: 0.75 }, children: ["Inversion of: ", seedSummary] })] }))] }), timeline && activeEntry && (_jsx(ArticlePanel, { seedSummary: seedSummary, entry: activeEntry, articleState: activeArticleState }))] }) })] }));
}
function ArticlePanel({ entry, articleState, seedSummary }) {
    if (!articleState || articleState.status === "idle") {
        return (_jsx("section", { style: { opacity: 0.6 }, children: "Select an entry to conjure its broadsheet narrative." }));
    }
    if (articleState.status === "loading") {
        return (_jsxs("section", { style: { fontSize: "1.1rem", letterSpacing: "0.06em" }, children: ["Filing the story for ", _jsx("strong", { children: entry.title }), "\u2026"] }));
    }
    if (articleState.status === "error") {
        return (_jsxs("section", { style: {
                border: "1px solid rgba(220,90,90,0.6)",
                padding: "1.5rem",
                background: "rgba(60,10,10,0.35)",
                color: "#f7dede",
                maxWidth: "52rem"
            }, children: ["Failed to inscribe article: ", articleState.error] }));
    }
    const article = articleState.data;
    if (!article)
        return null;
    const seededByText = seedSummary.trim() ? seedSummary.trim() : "UNSPECIFIED";
    return (_jsxs("article", { className: "ledger-article", style: {
            border: "1px solid rgba(245,241,230,0.15)",
            padding: "2rem",
            background: "rgba(10, 10, 14, 0.65)",
            maxWidth: "60rem",
            display: "grid",
            gap: "1.25rem",
            lineHeight: 1.7
        }, children: [_jsxs("header", { style: { marginBottom: "1.5rem" }, children: [_jsx("div", { style: {
                            fontSize: "0.9rem",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            opacity: 0.75
                        }, children: "Filed by the HAUNTOLOSCOPE Counterfactual Bureau" }), _jsxs("div", { style: {
                            fontSize: "0.85rem",
                            letterSpacing: "0.08em",
                            opacity: 0.7,
                            marginTop: "0.35rem",
                            textTransform: "uppercase"
                        }, children: ["Seeded by: ", seededByText] }), _jsx("h3", { className: "article-headline", style: { margin: "0.85rem 0", fontSize: "1.8rem" }, children: article.headline }), _jsx("div", { style: { fontFamily: "monospace", opacity: 0.7 }, children: article.dateline })] }), _jsx(ReactMarkdown, { className: "ledger-markdown lede", remarkPlugins: [remarkGfm], components: LEDE_MARKDOWN_COMPONENTS, children: article.lede }), article.body.map((segment, index) => (_jsx(ReactMarkdown, { className: "ledger-markdown", remarkPlugins: [remarkGfm], components: ARTICLE_MARKDOWN_COMPONENTS, children: segment }, index))), article.pull_quote && (_jsxs("blockquote", { style: {
                    margin: "2rem 0",
                    padding: "1.5rem",
                    border: "1px dashed rgba(245,241,230,0.25)",
                    fontSize: "1.2rem",
                    fontStyle: "italic"
                }, children: ["\u201C", article.pull_quote, "\u201D"] })), article.sidebar && article.sidebar.items.length > 0 && (_jsxs("aside", { style: {
                    borderTop: "1px solid rgba(245,241,230,0.15)",
                    paddingTop: "1rem",
                    marginTop: "1.5rem"
                }, children: [_jsx("h4", { style: { textTransform: "uppercase", letterSpacing: "0.08em" }, children: article.sidebar.title }), _jsx("ul", { style: { marginTop: "0.75rem", paddingLeft: "1.25rem" }, children: article.sidebar.items.map((item, index) => (_jsx("li", { style: { marginBottom: "0.5rem" }, children: item }, index))) })] }))] }));
}

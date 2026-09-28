import React, { useRef, useState } from "react";
import { Form, Spinner } from "react-bootstrap";
import {
  SERVICE_CALL_SEARCH_MIN_CHARS,
  searchServiceCalls,
  serviceCallMatches,
} from "../../lib/jobs/serviceCallSearch";

const SEARCH_DEBOUNCE_MS = 300;

function optionText(option) {
  return option ? String(option.label ?? option.value ?? "") : "";
}

/**
 * Service Call field that behaves like a plain text input: the selected call's
 * text is editable (caret at the end, Ctrl+A / Backspace work) and typing shows
 * matching calls underneath. The selection only changes when a match is picked;
 * leaving the field without picking restores the selected call.
 *
 * @param {Object|null} value - selected service call option
 * @param {Array} customerServiceCalls - calls loaded for the selected customer
 * @param {string[]} customerCardCodes - card codes of the selected customer (C + related L)
 * @param {boolean} searchAllCustomers - also search SAP across all customers
 * @param {(option: Object|null) => void} onSelect - picked a call, or null when the text was cleared
 * @param {{option: Object, message: string}|null} pending - a picked call still being applied
 */
export default function ServiceCallSearchInput({
  value,
  customerServiceCalls = [],
  customerCardCodes = [],
  searchAllCustomers = false,
  onSelect,
  disabled = false,
  loading = false,
  pending = null,
  placeholder = "Type to search service calls...",
}) {
  const [text, setText] = useState("");
  const [edited, setEdited] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [remoteResults, setRemoteResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const requestRef = useRef(0);
  const pickingRef = useRef(false);

  const displayText = pending
    ? optionText(pending.option)
    : edited
      ? text
      : optionText(value);
  const inputDisabled = disabled || Boolean(pending);
  const term = edited ? text.trim() : "";
  const customerCodes = new Set(
    customerCardCodes.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)
  );
  const hasCustomer = customerCodes.size > 0;

  const localIds = new Set(customerServiceCalls.map((sc) => String(sc.value)));
  const extraRemote = remoteResults.filter((sc) => !localIds.has(String(sc.value)));
  const isOwnCustomer = (sc) =>
    customerCodes.has(String(sc.customerCode || "").toUpperCase());
  // One list of matches: the selected customer's calls first, then other customers'.
  const flatOptions = [
    ...customerServiceCalls.filter((sc) => serviceCallMatches(sc, term)),
    ...extraRemote.filter(isOwnCustomer),
    ...extraRemote.filter((sc) => !isOwnCustomer(sc)),
  ];

  const cancelSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestRef.current += 1;
    setRemoteResults([]);
    setSearching(false);
    setSearchFailed(false);
  };

  const closeAndRestore = () => {
    cancelSearch();
    setEdited(false);
    setText("");
    setOpen(false);
    setHighlight(-1);
  };

  const runSearch = (nextText) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const requestId = ++requestRef.current;
    setSearchFailed(false);
    if (!searchAllCustomers || nextText.trim().length < SERVICE_CALL_SEARCH_MIN_CHARS) {
      setRemoteResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchServiceCalls(nextText);
        if (requestId === requestRef.current) setRemoteResults(results);
      } catch (error) {
        console.warn("Service call search failed:", error);
        if (requestId === requestRef.current) {
          setRemoteResults([]);
          setSearchFailed(true);
        }
      } finally {
        if (requestId === requestRef.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  };

  const pick = (option) => {
    pickingRef.current = true;
    closeAndRestore();
    inputRef.current?.blur();
    pickingRef.current = false;
    onSelect?.(option);
  };

  const handleFocus = (event) => {
    setOpen(true);
    // Caret at the end of the current text, like an ordinary input.
    const input = event.target;
    requestAnimationFrame(() => {
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  };

  const handleChange = (event) => {
    const nextText = event.target.value;
    setText(nextText);
    setEdited(true);
    setOpen(true);
    setHighlight(-1);
    runSearch(nextText);
  };

  const handleBlur = () => {
    if (pickingRef.current) return;
    // Text erased and left: clear the service call. Anything else: keep the selection.
    const clearedByUser = edited && text.trim() === "" && value;
    closeAndRestore();
    if (clearedByUser) onSelect?.(null);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (flatOptions.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((prev) => (prev + step + flatOptions.length) % flatOptions.length);
    } else if (event.key === "Enter") {
      // Never submit the job form from this field.
      event.preventDefault();
      const option = flatOptions[highlight] || (flatOptions.length === 1 ? flatOptions[0] : null);
      if (open && option) pick(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestore();
      event.currentTarget.blur();
    }
  };

  let message = null;
  if (flatOptions.length === 0) {
    if (loading) message = "Loading service calls...";
    else if (searching) message = "Searching...";
    else if (searchFailed) message = "Search is unavailable right now (SAP).";
    else if (!term) {
      message = hasCustomer
        ? "No service calls found for this customer"
        : searchAllCustomers
          ? `Type at least ${SERVICE_CALL_SEARCH_MIN_CHARS} characters (number, subject or customer)`
          : "Please select a customer first";
    } else if (searchAllCustomers && term.length < SERVICE_CALL_SEARCH_MIN_CHARS) {
      message = `Type at least ${SERVICE_CALL_SEARCH_MIN_CHARS} characters`;
    } else {
      message = "No open service calls match";
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <Form.Control
        ref={inputRef}
        type="text"
        value={displayText}
        placeholder={loading ? "Loading service calls..." : placeholder}
        disabled={inputDisabled}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {pending && (
        <Form.Text className="d-flex align-items-center gap-2 text-muted">
          <Spinner animation="border" size="sm" />
          {pending.message}
        </Form.Text>
      )}
      {open && !inputDisabled && (
        <div
          className="dropdown-menu show w-100 py-1"
          role="listbox"
          style={{ maxHeight: 300, overflowY: "auto", zIndex: 1060 }}
          // Keep focus in the input so blur doesn't fire before a click lands.
          onMouseDown={(event) => event.preventDefault()}
        >
          {message && <div className="dropdown-item-text text-muted small">{message}</div>}
          {flatOptions.map((option, index) => {
            const isSelected = value && String(value.value) === String(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`dropdown-item text-wrap${index === highlight ? " active" : ""}${
                  isSelected && index !== highlight ? " fw-semibold" : ""
                }`}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(option)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

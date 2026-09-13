type JobLogLine = {
  seq?: number;
  stream?: string;
  line: string;
};

export function JobLog({ lines }: { lines: JobLogLine[] }) {
  return (
    <pre className="job-log">
      {lines.length === 0
        ? "Нет записей"
        : lines.map((entry, index) => (
            <div key={entry.seq ?? index}>{entry.line}</div>
          ))}
    </pre>
  );
}

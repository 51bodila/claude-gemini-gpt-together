// Fake CLI: prints {argv, stdin}. First arg --sleep: sleeps 30 s. ECHO_ENV_KEYS=a,b also reports those env vars.
const argv = process.argv.slice(2);
if (argv[0] === "--sleep") {
  setTimeout(() => {}, 30000);
} else {
  let stdin = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => (stdin += d));
  process.stdin.on("end", () => {
    const o = { argv, stdin };
    if (process.env.ECHO_ENV_KEYS) o.env = Object.fromEntries(process.env.ECHO_ENV_KEYS.split(",").map((k) => [k, process.env[k] === undefined ? null : process.env[k]]));
    process.stdout.write(JSON.stringify(o));
  });
}

import { randomBytes, scryptSync } from 'node:crypto';

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
  throw new Error('Run this utility in an interactive terminal so the password is not supplied as a command argument.');
}

process.stdout.write('Account password (12+ characters): ');
process.stdin.setRawMode(true);
process.stdin.resume();

let password = '';
process.stdin.on('data', (chunk) => {
  for (const character of chunk.toString('utf8')) {
    if (character === '\u0003') process.exit(1);
    if (character === '\r' || character === '\n') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (password.length < 12 || password.length > 128) {
        throw new Error('Passwords must be between 12 and 128 characters.');
      }
      const salt = randomBytes(16).toString('hex');
      const key = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
      process.stdout.write(`scrypt$16384$8$1$${salt}$${key.toString('hex')}\n`);
      password = '';
      process.exit(0);
    }
    if (character === '\u007f' || character === '\b') {
      password = password.slice(0, -1);
    } else {
      password += character;
    }
  }
});

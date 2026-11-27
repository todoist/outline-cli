import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        // Tests sit next to what they cover: src/ for the CLI, .agents/scripts/ for the agent
        // tooling. Listing both keeps the tests of another copy of the repository inside the
        // checkout, such as a git worktree, out of this run.
        include: ['src/**/*.test.ts', '.agents/scripts/**/*.test.ts'],
        server: {
            deps: {
                inline: ['@todoist/cli-core'],
            },
        },
    },
})

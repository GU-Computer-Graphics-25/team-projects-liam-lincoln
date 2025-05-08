import { defineConfig } from 'vite'

export default defineConfig({
    base: '/team-projects-liam-lincoln/dist/', // This is important for GitHub Pages deployment
    build: {
        outDir: 'dist', // Output directory for build files
        emptyOutDir: true // Clean the output directory before building
    },
    optimizeDeps: {
        include: ['three']
    },
})

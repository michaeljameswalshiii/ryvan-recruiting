git submodule update --init --recursive
git add src/components/Sidebar.tsx
git commit -m "Update Sidebar with prominent theme toggle"
git push origin master
vercel deploy --prod --yes

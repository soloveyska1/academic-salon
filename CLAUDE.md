# Academic Salon (Академический Салон)

## Project Overview
Single-file HTML app — student document library + custom work ordering service.
Live at: https://bibliosaloon.ru/
Server: 94.241.143.29 (root / oFp?P3QTjAtF+s)

## Architecture
- **index.html** — entire frontend (HTML + CSS + JS + inline document catalog)
- **stats_api.py** — Python backend (stats, admin auth, CRUD, upload, orders, VK notifications)
- **salon.nginx.conf** — nginx config
- **catalog.json** — document catalog on server (synced via fetch)

## Server Paths
- HTML: /var/www/salon/index.html
- API: /opt/bibliosaloon/stats_api.py
- Service: bibliosaloon-stats.service
- DB: /var/lib/bibliosaloon/doc_stats.sqlite3
- Files: /var/www/salon/files/
- Backups: /var/backups/bibliosaloon/ (cron daily 3:17 AM)

## Deploy Commands
```bash
# Deploy HTML
sshpass -p 'oFp?P3QTjAtF+s' scp -o StrictHostKeyChecking=no index.html root@94.241.143.29:/var/www/salon/index.html

# Deploy API
sshpass -p 'oFp?P3QTjAtF+s' scp -o StrictHostKeyChecking=no stats_api.py root@94.241.143.29:/opt/bibliosaloon/stats_api.py
sshpass -p 'oFp?P3QTjAtF+s' ssh root@94.241.143.29 "systemctl restart bibliosaloon-stats"

# Deploy nginx
sshpass -p 'oFp?P3QTjAtF+s' scp -o StrictHostKeyChecking=no salon.nginx.conf root@94.241.143.29:/etc/nginx/sites-available/salon
sshpass -p 'oFp?P3QTjAtF+s' ssh root@94.241.143.29 "nginx -t && systemctl reload nginx"
```

## Admin Panel
- Access: 7 rapid clicks on footer copyright
- Password: hwafl7WCJMJgyvwr8O
- Auth: bcrypt server-side, session tokens
- Tabs: Dashboard, Documents, Upload, Orders, Export

## Key Features
- 235+ documents catalog with search/filters
- Price calculator (interactive)
- Order form with VK notifications (community token)
- Deep links (?doc=filename)
- Sharing (VK, TG, copy link)
- Course collections
- Yandex.Metrika (108363627)
- SEO (canonical, robots.txt, sitemap.xml, FAQ Schema)
- Dark + light themes
- Mobile responsive

## Contacts on Site
- VK: vk.com/academicsaloon
- TG manager: t.me/academicsaloon
- MAX: max.ru/join/lvaRhM9GTze3JfqgW9GsTisLfz-o_IOdVK-ev-_AsH0
- Email: academsaloon@mail.ru
- Owner VK: vk.com/imsaay

## Important Rules
- DO NOT touch `let D=[...]` array without extreme care
- Always verify JS syntax before deploy
- Always backup before major changes
- Dark theme is default
- Style: Stripe/Linear premium, "luxury stationery" for light theme

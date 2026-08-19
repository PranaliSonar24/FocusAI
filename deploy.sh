curl -s "https://www.duckdns.org/update?domains=myfocusai,myfocusapi&token=d19668ba-b5b6-42af-90fe-e2369ab42ee1&ip=100.53.69.47"
echo "DuckDNS Updated"
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo "Swap file created"
cd ~/FocusAI
sudo docker-compose up -d
cd backend
source .venv/bin/activate
nohup python3 main.py > backend.log 2>&1 &
echo "Backend started"
cd ../frontend
npm run build
nohup npm start > frontend.log 2>&1 &
echo "Frontend started"
sudo systemctl restart nginx
echo "NGINX restarted"

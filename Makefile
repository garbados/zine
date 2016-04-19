default:
	rm static/list.txt
	ls static/txt > static/list.txt
	git add --all . && git commit -m "fuck" && git push origin master

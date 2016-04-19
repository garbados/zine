default:
	make update
	git add --all . && git commit -m "fuck" && git push origin master

update:
	rm static/list.txt
	ls static/txt > static/list.txt
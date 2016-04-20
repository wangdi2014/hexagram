#!/bin/bash
# Update this port with the tar-ball

PORT=8300
DIR=/cluster/home/swat/hexmap
echo 'cleaning directory'
rm -rf $DIR/$PORT/*
echo 'untarring'
tar -C $DIR/$PORT -x -f $DIR/t.tar

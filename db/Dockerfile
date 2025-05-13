FROM postgres:latest

COPY ./init.sql /docker-entrypoint-initdb.d/

EXPOSE 5432

ENV POSTGRES_USER postgres
ENV POSTGRES_PASSWORD password
ENV POSTGRES_DB posts
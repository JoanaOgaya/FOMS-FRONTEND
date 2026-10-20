import bcrypt
password = b"Password@123"
salt = bcrypt.gensalt()
hashed = bcrypt.hashpw(password, salt)
print(hashed.decode("utf-8"))

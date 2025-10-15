import streamlit as st
import os

st.title("Streamlit Test App")

st.write("This is a test application for UV Dash E2E testing.")

# Display environment variables
st.subheader("Environment Variables")

test_env = os.environ.get('TEST_ENV', 'not_set')
api_key = os.environ.get('API_KEY', 'not_set')

st.write(f"**TEST_ENV:** {test_env}")

if api_key != 'not_set':
    st.write(f"**API_KEY:** ***hidden*** (length: {len(api_key)})")
else:
    st.write(f"**API_KEY:** {api_key}")

# Display current port
port = st.get_option("server.port")
if port:
    st.write(f"**Running on port:** {port}")

# Interactive elements
if st.button("Test Button"):
    st.success("Button clicked! App is working correctly.")

# Show that the app is responsive
with st.expander("Show Details"):
    st.write("Environment variables are being passed correctly!")
    st.write(f"Full environment: {dict(os.environ)}")

import streamlit as st
import pandas as pd

# Set up mobile viewport styling
st.set_page_config(page_title="Punters Formula Pro", page_icon="🏆", layout="centered")

st.title("🏆 Punters' Master Formula Engine")
st.write("---")

# Navigation Tabs for Mobile View
tab1, tab2 = st.tabs(["🔮 Strategy Matrix", "📊 Performance Tracker"])

# ==========================================
# TAB 1: STRATEGY MATRIX & POWER RANKINGS
# ==========================================
with tab1:
    st.header("Algorithmic Variable Weights")
    st.caption("Fine-tune weights based on track layout conditions.")
    
    # Mathematical Slider Weights
    col1, col2 = st.columns(2)
    with col1:
        speed_w = st.slider("🏎️ Speed / Sectionals %", 0.0, 1.0, 0.35, step=0.05)
        class_w = st.slider("👑 Class / Earnings %", 0.0, 1.0, 0.25, step=0.05)
        pace_w = st.slider("⚡ Pace & Energy %", 0.0, 1.0, 0.20, step=0.05)
    with col2:
        draw_w = st.slider("🚧 Draw / Barrier %", 0.0, 1.0, 0.10, step=0.05)
        rec_w = st.slider("📉 Recency / Form Decay %", 0.0, 1.0, 0.10, step=0.05)
        
    # Validation constraint warning
    total_w = speed_w + class_w + pace_w + draw_w + rec_w
    if round(total_w, 2) != 1.0:
        st.warning(f"⚠️ Total weights equal {round(total_w, 2)}. Adjust sliders to equal exactly 1.00 for pinpoint accuracy.")

    st.write("---")
    st.subheader("Runner Entry Scratchpad")
    
    # Interactive Input Form for calculation
    with st.form("ranking_form"):
        runner_name = st.text_input("Runner Name / Number", placeholder="e.g., Lucky Sam Gor")
        
        c1, col2, c3, c4, c5 = st.columns(5)
        with c1: s_score = st.number_input("Speed (1-100)", 1, 100, 50)
        with col2: c_score = st.number_input("Class (1-100)", 1, 100, 50)
        with c3: p_score = st.number_input("Pace (1-100)", 1, 100, 50)
        with c4: d_score = st.number_input("Draw (1-100)", 1, 100, 50)
        with c5: r_score = st.number_input("Form (1-100)", 1, 100, 50)
        
        submit_runner = st.form_submit_button("Calculate Power Score")
        
    if submit_runner and round(total_w, 2) == 1.0:
        # Master Matrix Formula Equation
        power_score = (s_score * speed_w) + (c_score * class_w) + (p_score * pace_w) + (d_score * draw_w) + (r_score * rec_w)
        st.metric(label=f"📊 {runner_name} Master Power Score", value=f"{round(power_score, 1)} pts")

# ==========================================
# TAB 2: RESULTS & CONVERGENCE TAB
# ==========================================
with tab2:
    st.header("Performance Logs & Results Audit")
    st.write("Log actual outcomes to track app deviation trends over time.")
    
    # Session state initializing for persistent local memory
    if "results_log" not in st.session_state:
        st.session_state.results_log = pd.DataFrame(
            columns=["Meeting", "Race", "Predicted Winner", "Actual Winner", "App Accuracy Status"]
        )
        
    with st.form("results_form"):
        rc_meeting = st.selectbox("Meeting Circuit", ["Sha Tin", "Durbanville", "UK Circuit"])
        rc_num = st.number_input("Race Number", 1, 12, 1)
        pred_win = st.text_input("App Selection (Top Pick)")
        act_win = st.text_input("Actual Winner on Track")
        
        log_button = st.form_submit_button("Log Race Result")
        
    if log_button:
        status = "🎯 STRIKE" if pred_win.lower().strip() == act_win.lower().strip() else "❌ DEVIATION"
        new_row = pd.DataFrame([{
            "Meeting": rc_meeting, "Race": rc_num, "Predicted Winner": pred_win, "Actual Winner": act_win, "App Accuracy Status": status
        }])
        st.session_state.results_log = pd.concat([st.session_state.results_log, new_row], ignore_index=True)
        st.success("Race results tracked successfully!")

    # Render Log Data Table
    st.subheader("Historical Challenge Session Logs")
    st.dataframe(st.session_state.results_log, use_container_width=True)
    
    # Calculate ongoing accuracy percentage metrics
    if not st.session_state.results_log.empty:
        strikes = len(st.session_state.results_log[st.session_state.results_log["App Accuracy Status"] == "🎯 STRIKE"])
        total_logged = len(st.session_state.results_log)
        strike_rate = (strikes / total_logged) * 100
        st.metric("🎯 Ongoing Master Formula Win Rate", f"{round(strike_rate, 1)}%")
